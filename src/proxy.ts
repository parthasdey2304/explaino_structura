import { NextResponse, type NextRequest } from "next/server";
import { hasTeacherSession } from "@/lib/authSession";

export function proxy(request: NextRequest) {
  if (request.method === "GET" && /^\/api\/canvases\/[^/]+\/share$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!hasTeacherSession(request)) {
    return NextResponse.json({ success: false, error: "Teacher session required." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/canvases/:path*" };
