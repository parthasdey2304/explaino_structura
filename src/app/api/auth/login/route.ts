import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTHORIZED_EMAIL = "parthasdeyofficial@gmail.com";
const AUTHORIZED_PASSWORD = "Vastavik1234Parth@Hacker";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (
      email.toLowerCase().trim() !== AUTHORIZED_EMAIL.toLowerCase().trim() ||
      password !== AUTHORIZED_PASSWORD
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password. Access is restricted." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      email: AUTHORIZED_EMAIL,
    });

    response.cookies.set("explaino-auth-session", "authenticated", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 days session
      httpOnly: false,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Authentication failed." },
      { status: 500 }
    );
  }
}
