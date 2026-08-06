// Threads 댓글 자동 감지 + 답글 초안 생성.
// 절대 무인으로 답글을 발행하지 않는다 — 새 댓글을 감지하면 답글 "초안"만
// 만들어 큐에 쌓아두고, 관리자가 /admin에서 확인 후 "답글 발행" 버튼을
// 눌러야만 실제로 Threads에 나간다 (기존 홍보 초안 시스템과 동일한 원칙).

import { getCurrentThreadsToken } from "./threadsToken.js";
import { publishReply } from "./threadsPublish.js";
import { pgPool } from "./db.js";
import { logger } from "./logger.js";

const GRAPH_BASE = "https://graph.threads.net/v1.0";
// 댓글 폴링 대상 기간 — 이보다 오래된 게시물은 더 이상 신규 댓글을 확인하지 않는다
// (오래된 글까지 매번 다 훑으면 API 호출이 계속 늘어나기만 함).
const POLL_WINDOW_DAYS = 14;

let _initialized = false;
async function ensureTables(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS threads_posts (
      id SERIAL PRIMARY KEY,
      threads_post_id TEXT NOT NULL UNIQUE,
      source_text TEXT,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS threads_comment_replies (
      id SERIAL PRIMARY KEY,
      threads_post_id TEXT NOT NULL,
      comment_id TEXT NOT NULL UNIQUE,
      commenter_username TEXT,
      comment_text TEXT,
      suggested_reply TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      replied_at TIMESTAMPTZ
    );
  `);
  _initialized = true;
}
ensureTables().catch((e) => logger.error({ err: String(e) }, "[threads-comments] 테이블 초기화 실패"));

// 실제로 Threads에 글을 발행한 직후 호출 — 이 글의 댓글을 앞으로 감시 대상에 넣는다.
export async function recordPublishedPost(threadsPostId: string, sourceText?: string): Promise<void> {
  await ensureTables();
  try {
    await pgPool.query(
      `INSERT INTO threads_posts (threads_post_id, source_text) VALUES ($1, $2)
       ON CONFLICT (threads_post_id) DO NOTHING`,
      [threadsPostId, sourceText ?? null]
    );
  } catch (err) {
    logger.warn({ err: String(err), threadsPostId }, "[threads-comments] 게시물 기록 실패");
  }
}

interface ThreadsReply {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
}

async function fetchReplies(threadsPostId: string, token: string): Promise<ThreadsReply[]> {
  const url = `${GRAPH_BASE}/${threadsPostId}/replies?fields=id,text,username,timestamp&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    logger.warn({ status: res.status, text, threadsPostId }, "[threads-comments] 댓글 조회 실패");
    return [];
  }
  const data = (await res.json()) as { data?: ThreadsReply[] };
  return data.data ?? [];
}

// CLAUDE_GUIDE.md.txt 톤(담백하고 세련되게, 광고 같지 않게)을 반영한 답글 초안 생성.
// OPENAI_API_KEY가 설정돼 있으면 문맥에 맞는 답글을 생성하고, 없으면 무난한
// 기본 답글로 대체한다 (부가 기능이라 실패해도 전체 흐름은 막지 않는다).
async function generateSuggestedReply(commentText: string, postText?: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  const fallback = "댓글 감사합니다! 자세한 조건은 게시글 댓글에 달린 링크에서 확인하실 수 있어요.";
  if (!apiKey || !commentText.trim()) return fallback;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "너는 건설UP(건설 일용직 구인 플랫폼)의 Threads 계정을 운영하는 담당자다. " +
              "댓글에 짧고 담백하게 답한다. 와디즈·토스·당근마켓 같은 자연스러운 말투를 쓰고, " +
              "광고 같은 말투나 과도한 이모지는 쓰지 않는다. 절대 전화번호를 직접 알려주지 않고, " +
              "구체적인 조건은 '게시글 댓글의 링크(또는 건설UP)에서 확인하라'고 안내한다. " +
              "2~3문장 이내로 짧게 답한다.",
          },
          {
            role: "user",
            content: `원글: ${postText ?? "(내용 없음)"}\n\n댓글: ${commentText}\n\n이 댓글에 대한 답글을 작성해줘.`,
          },
        ],
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[threads-comments] 답글 생성 API 실패 — 기본 답글로 대체");
      return fallback;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || fallback;
  } catch (err) {
    logger.warn({ err: String(err) }, "[threads-comments] 답글 생성 중 오류 — 기본 답글로 대체");
    return fallback;
  }
}

// 감시 중인 게시물들의 새 댓글을 확인하고, 신규 댓글마다 답글 초안을 생성해 큐에 쌓는다.
// 사람이 승인하기 전까지는 절대 실제 답글을 달지 않는다.
export async function pollForNewComments(): Promise<void> {
  await ensureTables();
  const tokenInfo = await getCurrentThreadsToken();
  if (!tokenInfo) {
    logger.debug("[threads-comments] Threads 토큰 없음 — 댓글 폴링 건너뜀");
    return;
  }

  const posts = await pgPool.query<{ threads_post_id: string; source_text: string | null }>(
    `SELECT threads_post_id, source_text FROM threads_posts
     WHERE published_at >= now() - interval '${POLL_WINDOW_DAYS} days'
     ORDER BY published_at DESC LIMIT 50`
  );

  for (const post of posts.rows) {
    const replies = await fetchReplies(post.threads_post_id, tokenInfo.token);
    for (const reply of replies) {
      // 이미 큐에 있거나 처리된 댓글은 건너뜀 (comment_id UNIQUE 제약으로도 이중 방지됨).
      try {
        const suggested = await generateSuggestedReply(reply.text ?? "", post.source_text ?? undefined);
        const inserted = await pgPool.query(
          `INSERT INTO threads_comment_replies (threads_post_id, comment_id, commenter_username, comment_text, suggested_reply)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (comment_id) DO NOTHING
           RETURNING id`,
          [post.threads_post_id, reply.id, reply.username ?? null, reply.text ?? null, suggested]
        );
        if ((inserted.rowCount ?? 0) > 0) {
          logger.info({ commentId: reply.id, username: reply.username }, "[threads-comments] 새 댓글 감지 — 답글 초안 생성");
        }
      } catch (err) {
        logger.warn({ err: String(err), commentId: reply.id }, "[threads-comments] 댓글 처리 실패");
      }
    }
  }
}

export interface PendingComment {
  id: number;
  threadsPostId: string;
  commentId: string;
  commenterUsername: string | null;
  commentText: string | null;
  suggestedReply: string | null;
  status: string;
  createdAt: string;
}

export async function listPendingComments(): Promise<PendingComment[]> {
  await ensureTables();
  const result = await pgPool.query(
    `SELECT id, threads_post_id AS "threadsPostId", comment_id AS "commentId",
            commenter_username AS "commenterUsername", comment_text AS "commentText",
            suggested_reply AS "suggestedReply", status, created_at AS "createdAt"
     FROM threads_comment_replies WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30`
  );
  return result.rows;
}

// 관리자가 "답글 발행" 버튼을 눌렀을 때만 호출 — 실제로 Threads에 답글을 단다.
export async function approveAndReply(id: number, text: string): Promise<{ ok: boolean; error?: string }> {
  await ensureTables();
  const result = await pgPool.query<{ comment_id: string; status: string }>(
    `SELECT comment_id, status FROM threads_comment_replies WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: "댓글을 찾을 수 없음" };
  if (row.status !== "pending") return { ok: false, error: "이미 처리된 댓글" };

  const publishResult = await publishReply(text, row.comment_id);
  if (!publishResult.ok) return { ok: false, error: publishResult.error };

  await pgPool.query(`UPDATE threads_comment_replies SET status = 'replied', replied_at = now() WHERE id = $1`, [id]);
  return { ok: true };
}

export async function dismissComment(id: number): Promise<void> {
  await ensureTables();
  await pgPool.query(`UPDATE threads_comment_replies SET status = 'dismissed' WHERE id = $1`, [id]);
}

let _handle: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 10 * 60_000; // 10분마다 확인
export function startCommentPolling(): void {
  if (_handle != null) return;
  _handle = setInterval(() => {
    pollForNewComments().catch((err) => logger.error({ err: String(err) }, "[threads-comments] 폴링 실패"));
  }, POLL_INTERVAL_MS);
}
