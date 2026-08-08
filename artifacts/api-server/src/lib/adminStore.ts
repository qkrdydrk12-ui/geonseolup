import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30일 — 비활동 자동 로그아웃 없음

// 서명 비밀키: SESSION_SECRET 기반 — 서버가 재시작돼도 토큰이 유효하게 유지된다.
const SIGNING_SECRET = process.env.SESSION_SECRET || "";
if (!SIGNING_SECRET) {
  throw new Error("SESSION_SECRET 환경변수가 필요합니다 (관리자 세션 토큰 서명용)");
}

export const adminStore = {
  adminId: "qkrdydrk12",
  adminPw: "wns585426!@",
};

function sign(payload: string): string {
  // 비밀번호를 서명에 포함 → 비밀번호를 변경하면 기존 토큰이 전부 무효화된다.
  return createHmac("sha256", SIGNING_SECRET)
    .update(`${adminStore.adminPw}|${payload}`)
    .digest("hex");
}

// 토큰 형식: "<만료시각ms>.<HMAC서명>" — 서버 메모리에 저장하지 않는 서명 기반 토큰.
export function issueToken(): string {
  const exp = String(Date.now() + SESSION_DURATION_MS);
  return `${exp}.${sign(exp)}`;
}

export function isTokenValid(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return false;
  const expected = sign(exp);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function getTokenFromReq(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromReq(req);
  if (!isTokenValid(token)) {
    res.status(401).json({ ok: false, message: "관리자 인증이 필요합니다" });
    return;
  }
  next();
}
