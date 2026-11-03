import { NextRequest, NextResponse } from "next/server";
import { hasTeacherSession } from "@/lib/authSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const authenticated = hasTeacherSession(request);
  return NextResponse.json({ authenticated }, {
    headers: { "Cache-Control": "no-store" },
  });
}
