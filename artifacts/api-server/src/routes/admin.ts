import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import {
  adminStore,
  isTokenValid,
  refreshTokenExpiry,
  getTokenFromReq,
} from "../lib/adminStore";

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

export default router;
