import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "explaino-auth-session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function signature(payload: string): Buffer | null {
  const secret = process.env.EXPLAINO_SESSION_SECRET;
  return secret ? createHmac("sha256", secret).update(payload).digest() : null;
}

export function createSession(): string {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + SESSION_LIFETIME_MS })).toString("base64url");
  const mac = signature(payload);
  if (!mac) throw new Error("Session signing is not configured.");
  return `${payload}.${mac.toString("base64url")}`;
}

export function hasTeacherSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [payload, macText, extra] = token.split(".");
  if (!payload || !macText || extra) return false;
  const expected = signature(payload);
  if (!expected) return false;
  try {
    const received = Buffer.from(macText, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.expiresAt === "number" && data.expiresAt > Date.now();
  } catch {
    return false;
  }
}
