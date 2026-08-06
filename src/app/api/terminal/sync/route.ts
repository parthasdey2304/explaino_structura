import { NextResponse } from "next/server";
import { TerminalService } from "@/lib/terminal/service";

export async function POST(request: Request) {
  try {
    const { sandboxId, files } = await request.json();

    if (!sandboxId || !files) {
      return NextResponse.json(
        { error: "sandboxId and files are required" },
        { status: 400 }
      );
    }

    await TerminalService.syncWorkspaceToSandbox(sandboxId, files);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
