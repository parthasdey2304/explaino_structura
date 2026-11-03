import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/authSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameSecret(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.EXPLAINO_ADMIN_PASSWORD;
  const configuredEmail = process.env.EXPLAINO_ADMIN_EMAIL || "parthasdeyofficial@gmail.com";
  if (!configuredPassword || !process.env.EXPLAINO_SESSION_SECRET) {
    return NextResponse.json({ success: false, error: "Teacher login is not configured." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.email !== "string" || typeof body.password !== "string" ||
      body.email.trim().toLowerCase() !== configuredEmail.toLowerCase() ||
      !sameSecret(body.password, configuredPassword)) {
    return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
  }
  const response = NextResponse.json({ success: true, email: configuredEmail });
  response.cookies.set(SESSION_COOKIE, createSession(), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
