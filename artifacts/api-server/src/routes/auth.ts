// 공수표(일용직 출퇴근 기록) 기능 0단계 — 카카오 로그인.
// 기획문서: Desktop/건설UP 공수표/건설UP_공수표_실행단계.html, 0단계 시작 2026-09-20.
import { Router, type IRouter, type Request, type Response } from "express";
import { pgPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { issueUserToken, USER_SESSION_COOKIE, getUserIdFromReq } from "../lib/userSession.js";

const router: IRouter = Router();

const SITE_URL = "https://geonseolup.com";
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || "";
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || "";
const REDIRECT_URI = `${SITE_URL}/api/auth/kakao/callback`;

// GET /api/auth/kakao/login — 카카오 인가 화면으로 리다이렉트.
router.get("/auth/kakao/login", (_req: Request, res: Response) => {
  if (!KAKAO_REST_API_KEY) {
    res.status(503).send("카카오 로그인이 설정되지 않았습니다.");
    return;
  }
  const url =
    `https://kauth.kakao.com/oauth/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(KAKAO_REST_API_KEY)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(url);
});

interface KakaoTokenResponse {
  access_token: string;
}

interface KakaoProfileResponse {
  id: number;
  kakao_account?: { profile?: { nickname?: string } };
}

// GET /api/auth/kakao/callback — 인가 코드 → 토큰 교환 → 프로필 조회 → users upsert → 세션 쿠키 발급.
router.get("/auth/kakao/callback", async (req: Request, res: Response) => {
  const code = req.query.code;
  if (typeof code !== "string") {
    res.redirect("/?login=fail");
    return;
  }
  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KAKAO_REST_API_KEY,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });
    if (!tokenRes.ok) {
      logger.warn({ status: tokenRes.status }, "[auth-kakao] 토큰 교환 실패");
      res.redirect("/?login=fail");
      return;
    }
    const tokenJson = (await tokenRes.json()) as KakaoTokenResponse;

    const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
      logger.warn({ status: profileRes.status }, "[auth-kakao] 프로필 조회 실패");
      res.redirect("/?login=fail");
      return;
    }
    const profile = (await profileRes.json()) as KakaoProfileResponse;
    const kakaoId = String(profile.id);
    const nickname = profile.kakao_account?.profile?.nickname || "회원";

    const upsert = await pgPool.query<{ id: number }>(
      `INSERT INTO users (kakao_id, nickname)
       VALUES ($1, $2)
       ON CONFLICT (kakao_id) DO UPDATE SET nickname = $2, updated_at = now()
       RETURNING id`,
      [kakaoId, nickname]
    );
    const userId = upsert.rows[0].id;

    const token = issueUserToken(userId);
    res.cookie(USER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.redirect("/");
  } catch (err) {
    logger.error({ err: String(err) }, "[auth-kakao] 콜백 처리 실패");
    res.redirect("/?login=fail");
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie(USER_SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me — 현재 로그인 회원 정보(마이페이지/입력화면에서 사용).
router.get("/auth/me", async (req: Request, res: Response) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    res.json({ ok: true, user: null });
    return;
  }
  try {
    const result = await pgPool.query<{ id: number; nickname: string }>(
      `SELECT id, nickname FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.json({ ok: true, user: null });
      return;
    }
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    logger.error({ err: String(err) }, "[auth-me] 조회 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
