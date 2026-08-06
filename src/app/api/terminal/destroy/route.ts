import { NextResponse } from "next/server";
import { TerminalService } from "@/lib/terminal/service";

export async function POST(request: Request) {
  try {
    const { sandboxId } = await request.json();

    if (!sandboxId) {
      return NextResponse.json(
        { error: "sandboxId is required" },
        { status: 400 }
      );
    }

    await TerminalService.destroySession(sandboxId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Destroy failed" },
      { status: 500 }
    );
  }
}
