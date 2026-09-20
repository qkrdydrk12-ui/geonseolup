// 일반 회원(공수표 등) 세션 토큰 — adminStore.ts와 같은 서명 기반 무상태 토큰 패턴,
// 단 비밀번호가 없는 카카오 로그인 사용자이므로 userId를 페이로드에 담는다.
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30일

const SIGNING_SECRET = process.env.SESSION_SECRET || "";
if (!SIGNING_SECRET) {
  throw new Error("SESSION_SECRET 환경변수가 필요합니다 (회원 세션 토큰 서명용)");
}

export const USER_SESSION_COOKIE = "cj_session";

function sign(payload: string): string {
  return createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
}

// 토큰 형식: "<userId>.<만료시각ms>.<HMAC서명>" — 서버 메모리에 저장하지 않는다.
export function issueUserToken(userId: number): string {
  const exp = String(Date.now() + SESSION_DURATION_MS);
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyUserToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdStr, exp, sig] = parts;
  if (!/^\d+$/.test(userIdStr) || !/^\d+$/.test(exp)) return null;
  if (Date.now() > Number(exp)) return null;
  const expected = sign(`${userIdStr}.${exp}`);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return Number(userIdStr);
}

export function getUserIdFromReq(req: Request): number | null {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[USER_SESSION_COOKIE];
  return verifyUserToken(token);
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    res.status(401).json({ ok: false, message: "로그인이 필요합니다" });
    return;
  }
  (req as Request & { userId?: number }).userId = userId;
  next();
}
