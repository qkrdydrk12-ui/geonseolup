// Threads 댓글 자동 감지 + 답글 "자동 발행".
// 계정 주인의 명시적 요청(2026-08)으로, 새 댓글을 감지하면 AI가 답글을 만들어
// 사람 승인 없이 바로 발행한다. 발행 이력은 threads_comment_replies에 남고
// 관리자 페이지에서 확인할 수 있다. 실패한 건은 pending으로 남아 수동 발행 가능.

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

// 내 계정 username — 내 계정이 단 댓글(링크 댓글, 승인된 답글 등)을
// "새 댓글"로 오인해 답글 초안을 만드는 것을 막기 위해 필요하다.
let _ownUsername: string | null = null;
async function getOwnUsername(token: string): Promise<string | null> {
  if (_ownUsername) return _ownUsername;
  try {
    const res = await fetch(`${GRAPH_BASE}/me?fields=username&access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    _ownUsername = data.username ?? null;
    return _ownUsername;
  } catch {
    return null;
  }
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

// 이모지 강제 제거 안전망 — 프롬프트로 금지해도 모델이 가끔 넣기 때문에 코드에서 한 번 더 걸러낸다.
// (계정 주인의 필수 규칙: 답글에 이모지 절대 금지)
function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, "")
    .replace(/[♡♥★☆]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
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
              "너는 건설UP(건설 일용직 구인 플랫폼)의 Threads 계정을 운영하는 사람이다. " +
              "가장 중요한 원칙: AI가 쓴 티가 절대 나면 안 된다. 와디즈·토스·당근마켓 운영자가 " +
              "댓글 다는 것처럼 자연스럽고 짧게, 1~2문장으로만 답한다. " +
              "필수 규칙(절대 위반 금지): 이모지를 단 하나도 쓰지 않는다. 😊💪♡ 같은 어떤 이모지·기호도 금지. " +
              "금지: '모집합니다', '지원하세요', '지금 확인하세요' 같은 광고 문구, " +
              "'안녕하세요!', '문의 감사합니다' 같은 상투적인 인사말. " +
              "댓글 내용에 실제로 반응하듯 답한다 — 질문이면 그 질문에, 관심 표현이면 거기에 맞게. " +
              "전화번호는 절대 직접 알려주지 않는다. 조건·연락처가 궁금하다는 댓글에는 " +
              "게시글 댓글의 링크(건설UP)에서 확인할 수 있다고 자연스럽게 안내한다.",
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
    const reply = stripEmojis(data.choices?.[0]?.message?.content?.trim() ?? "");
    return reply || fallback;
  } catch (err) {
    logger.warn({ err: String(err) }, "[threads-comments] 답글 생성 중 오류 — 기본 답글로 대체");
    return fallback;
  }
}

// 감시 중인 게시물들의 새 댓글을 확인하고, 신규 댓글마다 답글을 생성해
// 즉시 자동 발행한다 (계정 주인의 명시적 요청). 발행 실패 시 pending으로 남긴다.
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

  const ownUsername = await getOwnUsername(tokenInfo.token);
  if (!ownUsername) {
    // 내 계정 확인 실패 시 폴링을 건너뜀 — 내 링크 댓글에 답글 초안을 만드는 오작동 방지.
    logger.warn("[threads-comments] 내 계정(username) 확인 실패 — 이번 폴링 건너뜀");
    return;
  }

  for (const post of posts.rows) {
    const replies = await fetchReplies(post.threads_post_id, tokenInfo.token);
    for (const reply of replies) {
      // 내 계정이 단 댓글(링크 댓글·승인된 답글)은 건너뜀 — 자기 댓글에 답글을 달면 안 된다.
      if (ownUsername && reply.username === ownUsername) continue;
      // 이미 큐에 있거나 처리된 댓글은 건너뜀 (comment_id UNIQUE 제약으로도 이중 방지됨).
      try {
        const suggested = await generateSuggestedReply(reply.text ?? "", post.source_text ?? undefined);
        const inserted = await pgPool.query<{ id: number }>(
          `INSERT INTO threads_comment_replies (threads_post_id, comment_id, commenter_username, comment_text, suggested_reply)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (comment_id) DO NOTHING
           RETURNING id`,
          [post.threads_post_id, reply.id, reply.username ?? null, reply.text ?? null, suggested]
        );
        const insertedRow = inserted.rows[0];
        if (!insertedRow) continue; // 이미 처리된 댓글

        // 새 댓글 → 사람 승인 없이 바로 자동 발행 (계정 주인의 명시적 요청).
        const publishResult = await publishReply(suggested, reply.id);
        if (publishResult.ok) {
          await pgPool.query(
            `UPDATE threads_comment_replies SET status = 'replied', replied_at = now() WHERE id = $1`,
            [insertedRow.id]
          );
          logger.info({ commentId: reply.id, username: reply.username }, "[threads-comments] 새 댓글 감지 — 답글 자동 발행 완료");
        } else {
          // 발행 실패 시 pending으로 남겨 관리자 페이지에서 수동 발행 가능하게 한다.
          logger.warn(
            { commentId: reply.id, error: publishResult.error },
            "[threads-comments] 답글 자동 발행 실패 — 대기 목록에 남김"
          );
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
