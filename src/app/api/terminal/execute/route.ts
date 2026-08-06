import { NextResponse } from "next/server";
import { TerminalService } from "@/lib/terminal/service";

export async function POST(request: Request) {
  try {
    const { sandboxId, command } = await request.json();

    if (!sandboxId || !command) {
      return NextResponse.json(
        { error: "sandboxId and command are required" },
        { status: 400 }
      );
    }

    const result = await TerminalService.executeCommand(sandboxId, command);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command execution failed";
    // If sandbox is dead, inform the frontend
    if (message.includes("not found") || message.includes("not running")) {
      return NextResponse.json(
        { stdout: "", stderr: "⚠ Terminal session expired. Please start a new session.", success: false, expired: true },
        { status: 200 }
      );
    }
    return NextResponse.json({ stdout: "", stderr: message, success: false }, { status: 200 });
  }
}
