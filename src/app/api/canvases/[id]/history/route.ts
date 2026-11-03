import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await ensureDb();

    // Check if canvas exists
    const check = await db.execute({
      sql: `SELECT id FROM canvases WHERE id = ?`,
      args: [id],
    });

    if (check.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Canvas not found" },
        { status: 404 }
      );
    }

    const result = await db.execute({
      sql: `SELECT id, canvas_id, label, element_count, created_at
            FROM canvas_history
            WHERE canvas_id = ?
            ORDER BY created_at DESC`,
      args: [id],
    });

    const snapshots = result.rows.map((row) => ({
      id: row.id,
      canvas_id: row.canvas_id,
      label: row.label,
      element_count: row.element_count,
      created_at: row.created_at,
    }));

    return NextResponse.json({ success: true, snapshots });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = await ensureDb();
    const now = Date.now();

    const dataRes = await db.execute({
      sql: `SELECT canvas_id, elements, app_state, files, todos, notes, extensions_data
            FROM canvas_data
            WHERE canvas_id = ?`,
      args: [id],
    });

    if (dataRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Canvas not found" },
        { status: 404 }
      );
    }

    const row = dataRes.rows[0];
    const elementsStr = (row.elements as string) || "[]";
    let elementCount = 0;
    try {
      const parsed = JSON.parse(elementsStr);
      if (Array.isArray(parsed)) elementCount = parsed.length;
    } catch {
      elementCount = 0;
    }

    const snapshotId = `snap_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const label = body.label?.trim() || "Manual Checkpoint";

    await db.execute({
      sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshotId,
        id,
        label,
        elementsStr,
        row.app_state,
        row.files,
        row.todos,
        row.notes,
        row.extensions_data,
        elementCount,
        now,
      ],
    });

    return NextResponse.json({ success: true, snapshot_id: snapshotId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
