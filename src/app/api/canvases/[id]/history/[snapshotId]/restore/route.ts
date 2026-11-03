import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const { id, snapshotId } = await params;
    const db = await ensureDb();
    const now = Date.now();

    // 1. Fetch snapshot
    const snapRes = await db.execute({
      sql: `SELECT id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data
            FROM canvas_history
            WHERE id = ? AND canvas_id = ?`,
      args: [snapshotId, id],
    });

    if (snapRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Snapshot not found" },
        { status: 404 }
      );
    }

    const snap = snapRes.rows[0];

    // 2. Restore into canvas_data and touch canvases.updated_at
    await db.batch(
      [
        {
          sql: `UPDATE canvas_data
                SET elements = ?,
                    app_state = ?,
                    files = ?,
                    todos = ?,
                    notes = ?,
                    extensions_data = ?,
                    version = version + 1,
                    updated_at = ?
                WHERE canvas_id = ?`,
          args: [
            snap.elements,
            snap.app_state,
            snap.files,
            snap.todos,
            snap.notes,
            snap.extensions_data,
            now,
            id,
          ],
        },
        {
          sql: `UPDATE canvases SET updated_at = ? WHERE id = ?`,
          args: [now, id],
        },
      ],
      "write"
    );

    return NextResponse.json({
      success: true,
      restored: true,
      snapshot_id: snapshotId,
      updated_at: now,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
