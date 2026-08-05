import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import {
  adminStore,
  isTokenValid,
  refreshTokenExpiry,
  getTokenFromReq,
  requireAdmin,
} from "../lib/adminStore";
import { updateDocument, addDocument } from "../lib/firestoreClient.js";
import { getPublicJobs } from "../lib/jobsCache.js";
import { getPopularJobIds } from "../lib/jobViews.js";
import { countSubscriptions } from "../lib/pushSubscriptions.js";
import { countEmailSubscribers } from "../lib/emailSubscribers.js";
import { getCurrentThreadsToken } from "../lib/threadsToken.js";

const router = Router();

const SESSION_DURATION_MS = 20 * 60 * 1000;

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
  // 기존 세션 무효화 (단일 세션 보장)
  const token = randomBytes(32).toString("hex");
  adminStore.activeToken = token;
  adminStore.tokenExpiry = Date.now() + SESSION_DURATION_MS;
  res.json({ ok: true, token });
});

// POST /api/admin/logout
router.post("/admin/logout", (req: Request, res: Response) => {
  const token = getTokenFromReq(req);
  if (token && token === adminStore.activeToken) {
    adminStore.activeToken = null;
    adminStore.tokenExpiry = 0;
  }
  res.json({ ok: true });
});

// GET /api/admin/verify — 토큰 유효성 확인 + 만료 시간 갱신 (sliding window)
router.get("/admin/verify", (req: Request, res: Response) => {
  const token = getTokenFromReq(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "인증이 필요합니다" });
    return;
  }
  refreshTokenExpiry();
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
    const [{ jobs }, popular, pushCount, emailCount, threadsToken] = await Promise.all([
      getPublicJobs(),
      getPopularJobIds(5, 7),
      countSubscriptions(),
      countEmailSubscribers(),
      getCurrentThreadsToken(),
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
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

export default router;
