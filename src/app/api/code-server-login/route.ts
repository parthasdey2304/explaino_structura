import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_SERVER_ORIGIN = "http://13.49.76.201";
const CODE_SERVER_PWD = "14d26b731d1571af7802cfe5";

async function performLogin(req: NextRequest) {
  try {
    const upstreamRes = await fetch(`${CODE_SERVER_ORIGIN}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": req.headers.get("user-agent") || "ExplainoStructura/1.0",
      },
      body: `password=${encodeURIComponent(CODE_SERVER_PWD)}`,
      redirect: "manual",
    });

    const setCookieHeader = upstreamRes.headers.get("set-cookie");
    const response = NextResponse.json({
      success: true,
      status: upstreamRes.status,
      authenticated: true,
    });

    if (setCookieHeader) {
      const match = setCookieHeader.match(/code-server-session=([^;]+)/);
      if (match && match[1]) {
        const sessionValue = decodeURIComponent(match[1]);
        response.cookies.set("code-server-session", sessionValue, {
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 7, // 7 days session
        });
      }
    }

    return response;
  } catch (error) {
    console.error("[CodeServerAuth] Login helper error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return performLogin(req);
}

export async function GET(req: NextRequest) {
  return performLogin(req);
}
