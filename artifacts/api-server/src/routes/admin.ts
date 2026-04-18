import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";

const router = Router();

const DEFAULT_ID = "qkrdydrk12";
const DEFAULT_PW = "wns585426!@";
const SESSION_DURATION_MS = 20 * 60 * 1000; // 20분

const store = {
  adminId: DEFAULT_ID,
  adminPw: DEFAULT_PW,
  activeToken: null as string | null,
  tokenExpiry: 0,
};

function isTokenValid(token: string | undefined | null): boolean {
  if (!token || token !== store.activeToken) return false;
  if (Date.now() > store.tokenExpiry) {
    store.activeToken = null;
    store.tokenExpiry = 0;
    return false;
  }
  return true;
}

function getToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

// POST /api/admin/login
router.post("/admin/login", (req: Request, res: Response) => {
  const { id, pw } = req.body as { id?: string; pw?: string };
  if (!id || !pw) {
    res.status(400).json({ ok: false, message: "아이디와 비밀번호를 입력해주세요" });
    return;
  }
  if (id !== store.adminId || pw !== store.adminPw) {
    res.status(401).json({ ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" });
    return;
  }
  // 기존 세션 무효화 (단일 세션 보장)
  const token = randomBytes(32).toString("hex");
  store.activeToken = token;
  store.tokenExpiry = Date.now() + SESSION_DURATION_MS;
  res.json({ ok: true, token });
});

// POST /api/admin/logout
router.post("/admin/logout", (req: Request, res: Response) => {
  const token = getToken(req);
  if (token && token === store.activeToken) {
    store.activeToken = null;
    store.tokenExpiry = 0;
  }
  res.json({ ok: true });
});

// GET /api/admin/verify  — 토큰 유효성 확인 + 만료 시간 갱신 (sliding window)
router.get("/admin/verify", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "인증이 필요합니다" });
    return;
  }
  // 활동 감지 시 만료 시간 갱신
  store.tokenExpiry = Date.now() + SESSION_DURATION_MS;
  res.json({ ok: true });
});

// POST /api/admin/update-creds — 관리자 계정 정보 변경
router.post("/admin/update-creds", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "인증이 필요합니다" });
    return;
  }
  const { newId, newPw } = req.body as { newId?: string; newPw?: string };
  if (newId && newId.trim().length >= 4) store.adminId = newId.trim();
  if (newPw && newPw.trim().length >= 6) store.adminPw = newPw.trim();
  res.json({ ok: true });
});

export default router;
