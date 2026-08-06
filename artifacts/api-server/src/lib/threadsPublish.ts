// Threads(Meta) 실제 발행 — 관리자가 승인 버튼을 눌렀을 때만 호출된다.
// 절대 사람 승인 없이 자동으로 호출하지 않는다 (운영 원칙: 무인 발행 금지).
//
// 필요한 환경변수 (Replit Secrets):
//   THREADS_USER_ID — Threads 계정 숫자 ID (threads_credentials.json 참고)
// 액세스 토큰은 threadsToken.ts가 자동 갱신해 보관한 것을 그대로 쓴다.
//
// 콘텐츠 규칙(기존 운영 방침 그대로 적용):
//   - 본문에 링크를 넣지 않고, 링크는 별도 댓글로만 단다.
//   - 본문에 전화번호를 넣지 않는다(사이트 방문 유도).
// 이 규칙은 이 함수를 호출하는 쪽(관리자 승인 UI)에서 지켜야 하며,
// publishToThreads는 text와 linkUrl을 분리된 파라미터로 받아 구조적으로 강제한다.

import { getCurrentThreadsToken } from "./threadsToken.js";
import { logger } from "./logger.js";

const GRAPH_BASE = "https://graph.threads.net/v1.0";

interface PublishResult {
  ok: boolean;
  postId?: string;
  error?: string;
}

async function createAndPublishContainer(
  userId: string,
  token: string,
  text: string,
  opts: { replyToId?: string; imageUrl?: string } = {}
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const createParams = new URLSearchParams({
      media_type: opts.imageUrl ? "IMAGE" : "TEXT",
      text,
      access_token: token,
    });
    if (opts.imageUrl) createParams.set("image_url", opts.imageUrl);
    if (opts.replyToId) createParams.set("reply_to_id", opts.replyToId);

    const createRes = await fetch(`${GRAPH_BASE}/${userId}/threads?${createParams.toString()}`, {
      method: "POST",
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      return { ok: false, error: `container 생성 실패 [${createRes.status}]: ${t}` };
    }
    const created = (await createRes.json()) as { id: string };

    // Threads는 컨테이너 생성 후 발행까지 약간의 처리 시간이 필요하다고 문서에서 권장.
    await new Promise((r) => setTimeout(r, 2000));

    const publishRes = await fetch(
      `${GRAPH_BASE}/${userId}/threads_publish?creation_id=${created.id}&access_token=${encodeURIComponent(token)}`,
      { method: "POST" }
    );
    if (!publishRes.ok) {
      const t = await publishRes.text();
      return { ok: false, error: `발행 실패 [${publishRes.status}]: ${t}` };
    }
    const published = (await publishRes.json()) as { id: string };
    return { ok: true, id: published.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 본문 발행 후, 링크가 있으면 별도 댓글로 링크만 단다 (본문엔 링크 금지 원칙).
// imageUrl을 주면 이미지+캡션 게시물로, 안 주면 텍스트 전용 게시물로 발행한다.
export async function publishToThreads(text: string, linkUrl?: string, imageUrl?: string): Promise<PublishResult> {
  const userId = process.env["THREADS_USER_ID"];
  if (!userId) return { ok: false, error: "THREADS_USER_ID 미설정" };

  const tokenInfo = await getCurrentThreadsToken();
  if (!tokenInfo) return { ok: false, error: "저장된 Threads 토큰 없음 (THREADS_ACCESS_TOKEN_SEED 미설정)" };
  if (tokenInfo.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Threads 토큰이 만료됨 — 재발급 필요" };
  }

  const mainResult = await createAndPublishContainer(userId, tokenInfo.token, text, { imageUrl });
  if (!mainResult.ok || !mainResult.id) {
    logger.error({ error: mainResult.error }, "[threads-publish] 본문 발행 실패");
    return { ok: false, error: mainResult.error };
  }

  if (linkUrl) {
    const replyResult = await createAndPublishContainer(userId, tokenInfo.token, linkUrl, {
      replyToId: mainResult.id,
    });
    if (!replyResult.ok) {
      logger.warn({ error: replyResult.error }, "[threads-publish] 링크 댓글 발행 실패 (본문은 성공)");
    }
  }

  logger.info({ postId: mainResult.id, hasImage: Boolean(imageUrl) }, "[threads-publish] 발행 완료");
  return { ok: true, postId: mainResult.id };
}

// 특정 게시물/댓글에 답글을 단다 — 관리자가 "답글 발행" 버튼을 눌렀을 때만 호출된다.
// (threadsComments.ts에서 사용. 여기도 무인 자동 호출 절대 금지 원칙 동일 적용.)
export async function publishReply(text: string, replyToId: string): Promise<PublishResult> {
  const userId = process.env["THREADS_USER_ID"];
  if (!userId) return { ok: false, error: "THREADS_USER_ID 미설정" };

  const tokenInfo = await getCurrentThreadsToken();
  if (!tokenInfo) return { ok: false, error: "저장된 Threads 토큰 없음 (THREADS_ACCESS_TOKEN_SEED 미설정)" };
  if (tokenInfo.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Threads 토큰이 만료됨 — 재발급 필요" };
  }

  const result = await createAndPublishContainer(userId, tokenInfo.token, text, { replyToId });
  if (!result.ok || !result.id) {
    logger.error({ error: result.error }, "[threads-publish] 답글 발행 실패");
    return { ok: false, error: result.error };
  }
  logger.info({ postId: result.id, replyToId }, "[threads-publish] 답글 발행 완료");
  return { ok: true, postId: result.id };
}
