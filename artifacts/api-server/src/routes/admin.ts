import { Router, type Request, type Response } from "express";
import {
  adminStore,
  isTokenValid,
  issueToken,
  getTokenFromReq,
  requireAdmin,
} from "../lib/adminStore";
import { updateDocument, addDocument } from "../lib/firestoreClient.js";
import { getPublicJobs } from "../lib/jobsCache.js";
import { getPopularJobIds } from "../lib/jobViews.js";
import { countSubscriptions } from "../lib/pushSubscriptions.js";
import { countEmailSubscribers } from "../lib/emailSubscribers.js";
import { getCurrentThreadsToken } from "../lib/threadsToken.js";
import { isIndexingConfigured } from "../lib/googleIndexing.js";
import { listPendingDrafts, markDraftPublished, markDraftRejected, getDraftById, generateDraftImage, deleteLegacyPendingDrafts } from "../lib/threadsDrafts.js";
import { publishToThreads } from "../lib/threadsPublish.js";
import { recordPublishedPost, listPendingComments, approveAndReply, dismissComment, pollForNewComments } from "../lib/threadsComments.js";

const router = Router();

// POST /api/admin/login
router.post("/admin/login", (req: Request, res: Response) => {
  const { id, pw } = req.body as { id?: string; pw?: string };
  if (!id || !pw) {
    res.status(400).json({ ok: false, message: "아이디와 비밀번호를 입력해주세요" });
    return;
  }
  if (id !== adminStore.adminId || pw !== adminStore.adminPw) {
    res.status(401).json({ ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" });
    return;
  }
  // 서명 기반 토큰 (30일 유효, 서버 재시작에도 유지)
  res.json({ ok: true, token: issueToken() });
});

// POST /api/admin/logout — 클라이언트가 토큰을 삭제하면 로그아웃
router.post("/admin/logout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/admin/verify — 토큰 유효성 확인
router.get("/admin/verify", (req: Request, res: Response) => {
  const token = getTokenFromReq(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "인증이 필요합니다" });
    return;
  }
  res.json({ ok: true });
});

// POST /api/admin/update-creds — 관리자 계정 정보 변경
router.post("/admin/update-creds", (req: Request, res: Response) => {
  const token = getTokenFromReq(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "인증이 필요합니다" });
    return;
  }
  const { newId, newPw } = req.body as { newId?: string; newPw?: string };
  if (newId && newId.trim().length >= 4) adminStore.adminId = newId.trim();
  if (newPw && newPw.trim().length >= 6) adminStore.adminPw = newPw.trim();
  res.json({ ok: true });
});

// DELETE /api/admin/jobs/:id — 공고 소프트 삭제 (관리자 인증 필수)
// 백엔드에서 관리자 권한 검증 후 deleted=true soft delete 처리 + 삭제 로그 저장
router.delete(
  "/admin/jobs/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const jobId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    if (!jobId) {
      res.status(400).json({ ok: false, message: "공고 ID가 필요합니다" });
      return;
    }
    const { reason, jobTitle } = req.body as {
      reason?: string;
      jobTitle?: string;
    };
    const now = new Date().toISOString();
    const deletedBy = adminStore.adminId || "admin";

    try {
      // 소프트 삭제: hidden=true, _deleted=true, 삭제 메타 기록
      await updateDocument("jobs", jobId, {
        hidden: true,
        _deleted: true,
        deletedAt: now,
        deletedBy,
        deleteReason: reason || null,
      });

      // 삭제 로그 저장 (별도 컬렉션)
      try {
        await addDocument("deleteLogs", {
          jobId,
          jobTitle: jobTitle || null,
          deletedAt: now,
          deletedBy,
          reason: reason || null,
          _createdAt: now,
        });
      } catch {
        // 로그 저장 실패는 삭제 성공을 취소하지 않음
      }

      res.json({ ok: true, jobId, deletedAt: now });
    } catch (err) {
      res.status(500).json({ ok: false, message: String(err) });
    }
  }
);

// GET /api/admin/stats/summary — 성장 지표 한눈에 보기 (관리자 전용).
// 공고 수, 구독자 수(푸시/이메일), 인기 공고, Threads 토큰 상태를 한 번에 반환.
router.get("/admin/stats/summary", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [{ jobs }, popular, pushCount, emailCount, threadsToken, pendingDrafts] = await Promise.all([
      getPublicJobs(),
      getPopularJobIds(5, 7),
      countSubscriptions(),
      countEmailSubscribers(),
      getCurrentThreadsToken(),
      listPendingDrafts(),
    ]);

    res.json({
      activeJobs: jobs.length,
      popularJobs: popular,
      subscribers: {
        push: pushCount,
        emailConfirmed: emailCount.confirmed,
        emailPendingConfirm: emailCount.unconfirmed,
      },
      threadsToken: threadsToken
        ? {
            configured: true,
            expiresAt: threadsToken.expiresAt.toISOString(),
            daysLeft: Math.floor((threadsToken.expiresAt.getTime() - Date.now()) / 86400000),
          }
        : { configured: false },
      threadsPendingDrafts: pendingDrafts.length,
      // 2026-08-26: Google Indexing API(신규 구인공고 즉시 알림) 자격증명 설정 여부만 확인
      // (값 자체는 절대 노출 안 함 — 있는지 없는지만 boolean으로).
      googleIndexingConfigured: isIndexingConfigured(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ── Threads 홍보 초안: 목록 조회 / 발행(승인) / 거절 — 전부 관리자 인증 필수 ──
// 발행은 오직 이 라우트를 통해서만 일어난다 = 사람이 명시적으로 버튼을 눌러야만 나감.

// POST /api/admin/threads/publish — 자동 초안이 아니라 관리자가 직접 쓴 문구를 즉시 발행
// (테스트용 + 자동 조건에 안 걸리는 공고도 수동으로 홍보하고 싶을 때 사용).
router.post("/admin/threads/publish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const linkUrl = typeof req.body?.linkUrl === "string" ? req.body.linkUrl.trim() : undefined;
    if (!text) {
      res.status(400).json({ ok: false, message: "문구를 입력해주세요" });
      return;
    }
    const result = await publishToThreads(text, linkUrl || undefined);
    if (!result.ok) {
      res.status(502).json({ ok: false, message: result.error ?? "발행 실패" });
      return;
    }
    if (result.postId) await recordPublishedPost(result.postId, text);
    res.json({ ok: true, postId: result.postId });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/track-post — 이미 (다른 경로로) 발행된 Threads 게시물을
// 댓글 자동감지 대상에 등록만 한다. 실제 발행은 하지 않는다.
// (2026-08-07: 매일 자동화가 Claude in Chrome으로 threads.net에 직접 게시하는데,
//  이 경로는 publishToThreads()를 안 거치므로 recordPublishedPost가 호출된 적이
//  없었음 — 그래서 자동 답글 시스템이 그 글들의 댓글을 전혀 몰랐던 것. 자동화가
//  게시 직후 이 엔드포인트를 호출해 threads_posts에 등록하면 그 후로는 기존
//  10분 주기 폴링이 정상적으로 댓글을 감지해 답글을 단다.)
router.post("/admin/threads/track-post", requireAdmin, async (req: Request, res: Response) => {
  try {
    const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
    const text = typeof req.body?.text === "string" ? req.body.text : undefined;
    if (!postId) {
      res.status(400).json({ ok: false, message: "postId가 필요합니다" });
      return;
    }
    await recordPublishedPost(postId, text);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// GET /api/admin/threads/drafts — 대기 중인 초안 목록
router.get("/admin/threads/drafts", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const drafts = await listPendingDrafts();
    res.json({ ok: true, drafts });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/drafts/cleanup-legacy — 이미지 생성 기능이 없던 시절의
// 구형 대기 초안(이미지 프롬프트 없음)을 한 번에 정리. 이미지 생성 가능한 초안은 남긴다.
router.post("/admin/threads/drafts/cleanup-legacy", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const deleted = await deleteLegacyPendingDrafts();
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/drafts/:id/publish — 관리자가 승인 버튼을 눌렀을 때만 호출
router.post("/admin/threads/drafts/:id/publish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await getDraftById(id);
    if (!draft || draft.status !== "pending") {
      res.status(404).json({ ok: false, message: "초안을 찾을 수 없거나 이미 처리됨" });
      return;
    }
    // 편집된 문구를 보냈다면 그걸 우선 사용 (관리자가 발행 전 수정 가능)
    const text = typeof req.body?.text === "string" && req.body.text.trim() ? req.body.text.trim() : draft.text;
    const imageUrl = draft.hasImage ? `https://geonseolup.com/api/threads-image/${draft.id}` : undefined;
    const result = await publishToThreads(text, draft.linkUrl, imageUrl);
    if (!result.ok) {
      res.status(502).json({ ok: false, message: result.error ?? "발행 실패" });
      return;
    }
    if (result.postId) await recordPublishedPost(result.postId, text);
    await markDraftPublished(id);
    res.json({ ok: true, postId: result.postId });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/drafts/:id/generate-image — 관리자가 필요할 때만 클릭해서
// 그 초안 하나에 대해서만 실제 이미지를 생성 (비용은 이 호출에서만 발생).
router.post("/admin/threads/drafts/:id/generate-image", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    const result = await generateDraftImage(id);
    if (!result.ok) {
      res.status(502).json({ ok: false, message: result.error ?? "이미지 생성 실패" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/drafts/:id/reject — 마음에 안 들면 그냥 버리기
router.post("/admin/threads/drafts/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  try {
    await markDraftRejected(Number(req.params["id"]));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ── Threads 댓글 자동 감지 + 답글 승인 ──────────────────────────────────────
// 댓글 감시·답글 초안 생성은 자동(10분마다 폴링)이지만, 실제 답글 발행은
// 반드시 이 라우트를 통해 관리자가 명시적으로 승인해야만 나간다.

// GET /api/admin/threads/comments — 대기 중인 댓글(+제안 답글) 목록
router.get("/admin/threads/comments", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const comments = await listPendingComments();
    res.json({ ok: true, comments });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/comments/poll-now — 지금 바로 한 번 확인 (10분 대기 없이 테스트용)
router.post("/admin/threads/comments/poll-now", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await pollForNewComments();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/comments/:id/reply — 관리자가 승인 버튼을 눌렀을 때만 실제 답글 발행
router.post("/admin/threads/comments/:id/reply", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ ok: false, message: "답글 내용을 입력해주세요" });
      return;
    }
    const result = await approveAndReply(id, text);
    if (!result.ok) {
      res.status(502).json({ ok: false, message: result.error ?? "답글 발행 실패" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// POST /api/admin/threads/comments/:id/dismiss — 답글 안 달고 넘어가기
router.post("/admin/threads/comments/:id/dismiss", requireAdmin, async (req: Request, res: Response) => {
  try {
    await dismissComment(Number(req.params["id"]));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

export default router;
