// Threads 댓글 자동 감지 + 답글 자동 발행.
// 2026-08-06 사용자 지시로 변경: 새 댓글을 감지하면 답글을 생성해 그 자리에서
// 바로 Threads에 발행한다 (기존엔 관리자 승인 필수였으나, 계정 소유자 본인이
// "댓글 달면 자동으로 답글 달아달라"고 명시적으로 요청해 변경함).
// 발행에 실패한 경우에만 'pending'으로 남아 /admin 큐에서 수동 처리 가능.

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

// URL 숏코드(예: threads.com/@계정/post/Db0MfFamO73 의 "Db0MfFamO73")와 실제
// Graph API 미디어 ID(예: "18015052187922581")는 서로 다른 값이다. Claude in
// Chrome으로 브라우저에서 직접 게시하는 현재 방식은 URL에서 숏코드만 뽑아낼 수
// 있는데, 댓글 폴링(fetchReplies)은 반드시 실제 미디어 ID가 필요하다 — 숏코드를
// 그대로 쓰면 Graph API가 "Object with ID ... does not exist"로 매번 조용히
// 실패한다 (2026-08-09 실측 확인: 이 버그 때문에 브라우저로 게시한 글은 댓글
// 자동 감지가 단 한 번도 작동한 적이 없었음 — 토큰/시크릿 문제가 아니었음).
// 그래서 등록 시점에 숏코드면 최근 게시물 목록에서 매칭되는 실제 ID로 치환한다.
async function resolveMediaId(threadsPostId: string, token: string): Promise<string> {
  // 실제 미디어 ID는 항상 순수 숫자 문자열이다 — 이미 숫자면 그대로 쓴다
  // (관리자 승인 발행 경로(threadsPublish.ts)는 원래부터 올바른 숫자 ID를 준다).
  if (/^\d+$/.test(threadsPostId)) return threadsPostId;

  const userId = process.env["THREADS_USER_ID"];
  if (!userId) return threadsPostId; // 변환 불가 — 기존 동작 그대로 (원래 값 사용)

  try {
    const url = `${GRAPH_BASE}/${userId}/threads?fields=id,shortcode&limit=25&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return threadsPostId;
    const data = (await res.json()) as { data?: { id: string; shortcode?: string }[] };
    const match = data.data?.find((p) => p.shortcode === threadsPostId);
    if (match) {
      logger.info(
        { shortcode: threadsPostId, mediaId: match.id },
        "[threads-comments] 숏코드 → 실제 미디어 ID 변환 성공"
      );
      return match.id;
    }
    logger.warn({ shortcode: threadsPostId }, "[threads-comments] 숏코드에 매칭되는 최근 게시물을 못 찾음 — 원래 값 사용");
    return threadsPostId;
  } catch (err) {
    logger.warn({ err: String(err), threadsPostId }, "[threads-comments] 숏코드 변환 중 오류 — 원래 값 사용");
    return threadsPostId;
  }
}

// 실제로 Threads에 글을 발행한 직후 호출 — 이 글의 댓글을 앞으로 감시 대상에 넣는다.
export async function recordPublishedPost(threadsPostId: string, sourceText?: string): Promise<void> {
  await ensureTables();
  try {
    const tokenInfo = await getCurrentThreadsToken();
    const resolvedId = tokenInfo ? await resolveMediaId(threadsPostId, tokenInfo.token) : threadsPostId;
    await pgPool.query(
      `INSERT INTO threads_posts (threads_post_id, source_text) VALUES ($1, $2)
       ON CONFLICT (threads_post_id) DO NOTHING`,
      [resolvedId, sourceText ?? null]
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

// 모델이 지침을 어기고 이모지를 넣는 경우에 대비한 안전망 — 어떤 이모지든 무조건 제거.
// (2026-08-06 사용자 지시: "이모지 달지 말아줘 ... 필수로" — 프롬프트만으로는 완전히
//  보장되지 않으므로 후처리로 한 번 더 강제 제거한다.)
function stripEmoji(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/️/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // 서로게이트 페어 이모지(대부분의 이모지)
    .replace(/[☀-➿⬀-⯿←-⇿⌀-⏿]/g, "") // 기호/화살표/기타 심볼
    .replace(/\s{2,}/g, " ")
    .trim();
}

// 스하리/반하리류 "인사성 방문 댓글" 감지 — 시스템 프롬프트에도 이 경우 원글 주제로
// 되돌리거나 질문하지 말라고 지시해뒀지만, 모델이 그 지시를 어기고 원글 얘기를 다시
// 꺼내며 질문을 붙이는 사고가 실제로 발생했다(2026-08-14 실측: "반하리 3종 왔어요"에
// "요즘 건설 현장 분위기가 어떠신가요?"로 답해버려 사용자가 직접 발견·지적함).
// 그래서 stripEmoji와 같은 방식으로, 프롬프트만 믿지 않고 후처리 안전망을 하나 더 둔다.
const GREETING_COMMENT_PATTERN = /스하리|반하리|맞팔|리포|스친|화력/;
const GREETING_REPLY_FALLBACKS = [
  "반가워요, 저도 놀러갈게요",
  "와주셔서 감사해요, 저도 곧 놀러갈게요",
  "반가워요, 맞팔 감사합니다",
  "고마워요, 저도 인사드리러 갈게요",
];

// 인사성 방문 댓글인데 생성된 답글이 질문을 붙이거나(원글로 되묻기) 지나치게 길면
// (원글 주제로 샌다는 신호) 무난한 답례 인사로 강제 교체한다.
function enforceGreetingReply(commentText: string, reply: string): string {
  if (!GREETING_COMMENT_PATTERN.test(commentText)) return reply;
  if (reply.includes("?") || reply.length > 40) {
    return GREETING_REPLY_FALLBACKS[Math.floor(Math.random() * GREETING_REPLY_FALLBACKS.length)]!;
  }
  return reply;
}

// CLAUDE_GUIDE.md.txt 톤(담백하고 세련되게, 광고 같지 않게)을 반영한 답글 생성.
// OPENAI_API_KEY가 설정돼 있으면 문맥에 맞는 답글을 생성하고, 없으면 무난한
// 기본 답글로 대체한다 (부가 기능이라 실패해도 전체 흐름은 막지 않는다).
async function generateSuggestedReply(commentText: string, postText?: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  const fallback = "댓글 감사합니다! 자세한 조건은 게시글 댓글에 달린 링크에서 확인하실 수 있어요.";
  if (!apiKey || !commentText.trim()) return enforceGreetingReply(commentText, fallback);

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
              "너는 건설UP(건설 일용직 구인 플랫폼)의 Threads 계정을 운영하는 실제 사람이다. " +
              "AI가 쓴 티가 절대 나면 안 된다 — 와디즈·토스·당근마켓 운영자가 댓글 다는 것처럼, " +
              "짧고 자연스럽고 사람 냄새 나게 쓴다.\n" +
              "🚫 필수 규칙(예외 없음): 이모지·이모티콘을 단 하나도 쓰지 않는다. 손가락·불꽃·하트·웃음 등 " +
              "종류를 막론하고 이모지 전면 금지. 텍스트만으로 자연스럽게 쓴다.\n" +
              "금지: '모집합니다·지원하세요·지금 확인하세요·아래 링크' 같은 광고 문구, " +
              "딱딱한 안내문 말투, '~해주셔서 감사합니다' 식 상투적 인사로 시작하는 것.\n" +
              "⚠️ 댓글이 '스하리', '반하리', '맞팔', '리포', '스친', '화력' 같은 단어가 들어간 " +
              "인사성 방문 댓글(예: '반하리 3종 왔어요', '스하리 하고 갑니다')이면, 그건 원글 내용에 " +
              "대한 질문이나 감상이 아니라 그냥 서로 좋아요/리포스트/댓글을 주고받는 문화적 인사다. " +
              "이 경우 원글 주제(건설 현장 얘기 등)로 되돌리거나 원글에 대한 감상을 되묻지 말고, " +
              "'반가워요, 저도 놀러갈게요' 같은 짧고 담백한 답례 인사만 한다(1문장, 질문 금지).\n" +
              "그 외의 경우엔 댓글 내용에 실제로 반응하듯 자연스럽게 받아친다(예: 질문이면 답하고, 공감이면 맞장구치고). " +
              "절대 전화번호를 직접 알려주지 않고, 구체적인 조건이 궁금하다고 하면 " +
              "'게시글에 달린 링크(또는 건설UP)에서 확인해보세요' 정도로 자연스럽게 안내한다. " +
              "1~2문장, 길어도 3문장 이내로 짧게.",
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
      return enforceGreetingReply(commentText, fallback);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return enforceGreetingReply(commentText, stripEmoji(reply) || fallback);
  } catch (err) {
    logger.warn({ err: String(err) }, "[threads-comments] 답글 생성 중 오류 — 기본 답글로 대체");
    return enforceGreetingReply(commentText, fallback);
  }
}

// 감시 중인 게시물들의 새 댓글을 확인하고, 신규 댓글마다 답글을 생성해 바로 발행한다.
// 발행 성공 시 status='replied', 실패 시에만 'pending'으로 남아 /admin에서 수동 재시도 가능.
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

  // 우리 계정 자신이 단 댓글(예: 유입 유도용 링크 댓글)은 답글 대상에서 반드시 제외한다.
  // 2026-08-10 실측 발견: 이 필터가 없어서 봇이 자동화가 스스로 단
  // "geonseolup.com/?utm_source=threads" 링크 댓글을 새 댓글로 착각해 자기 자신에게
  // 답글을 달아버리는 사고가 실제로 발생했음(사용자가 직접 발견, 수동 삭제함).
  const ownUsername = (process.env["THREADS_USERNAME"] || "geonseolup").toLowerCase();

  for (const post of posts.rows) {
    const replies = await fetchReplies(post.threads_post_id, tokenInfo.token);
    for (const reply of replies) {
      if (reply.username && reply.username.toLowerCase() === ownUsername) {
        continue; // 자기 자신의 댓글 — 답글 대상 아님
      }
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
        const newId = inserted.rows[0]?.id as number | undefined;
        if (newId == null) continue; // 이미 처리된 댓글

        logger.info({ commentId: reply.id, username: reply.username }, "[threads-comments] 새 댓글 감지 — 답글 자동 발행 시도");
        const publishResult = await publishReply(suggested, reply.id);
        if (publishResult.ok) {
          await pgPool.query(
            `UPDATE threads_comment_replies SET status = 'replied', replied_at = now() WHERE id = $1`,
            [newId]
          );
          logger.info({ commentId: reply.id, username: reply.username }, "[threads-comments] 답글 자동 발행 완료");
        } else {
          // 발행 실패 시엔 'pending'으로 남겨 /admin 큐에서 수동으로 재시도할 수 있게 둔다.
          logger.warn(
            { commentId: reply.id, error: publishResult.error },
            "[threads-comments] 답글 자동 발행 실패 — 관리자 큐에 대기 상태로 남김"
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
