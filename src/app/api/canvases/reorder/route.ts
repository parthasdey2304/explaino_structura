import { NextRequest, NextResponse } from "next/server";
import { ensureDb, type InStatement } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { order } = body;

    if (!Array.isArray(order)) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: 'order' must be an array of canvas IDs" },
        { status: 400 }
      );
    }

    const db = await ensureDb();
    const now = Date.now();

    const batch: InStatement[] = order.map((canvasId: string, index: number) => ({
      sql: `UPDATE canvases SET sort_order = ?, updated_at = ? WHERE id = ?`,
      args: [index, now, canvasId],
    }));

    if (batch.length > 0) {
      await db.batch(batch, "write");
    }

    return NextResponse.json({ success: true, count: batch.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
