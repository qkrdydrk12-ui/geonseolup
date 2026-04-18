import type { Request, Response, NextFunction } from "express";

const SESSION_DURATION_MS = 20 * 60 * 1000;

export const adminStore = {
  adminId: "qkrdydrk12",
  adminPw: "wns585426!@",
  activeToken: null as string | null,
  tokenExpiry: 0,
};

export function isTokenValid(token: string | undefined | null): boolean {
  if (!token || token !== adminStore.activeToken) return false;
  if (Date.now() > adminStore.tokenExpiry) {
    adminStore.activeToken = null;
    adminStore.tokenExpiry = 0;
    return false;
  }
  return true;
}

export function refreshTokenExpiry() {
  adminStore.tokenExpiry = Date.now() + SESSION_DURATION_MS;
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
