import { NextResponse } from "next/server";
import { TerminalService } from "@/lib/terminal/service";

export async function POST() {
  try {
    const sandboxId = await TerminalService.createSession();
    return NextResponse.json({ sandboxId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create terminal session" },
      { status: 500 }
    );
  }
}
