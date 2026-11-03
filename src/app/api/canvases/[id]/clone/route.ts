import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = await ensureDb();
    const now = Date.now();

    // 1. Fetch original canvas and canvas_data
    const orig = await db.execute({
      sql: `SELECT c.name, c.description, c.thumbnail,
                   d.elements, d.app_state, d.files, d.todos, d.notes, d.extensions_data
            FROM canvases c
            LEFT JOIN canvas_data d ON c.id = d.canvas_id
            WHERE c.id = ?`,
      args: [id],
    });

    if (orig.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Canvas not found" },
        { status: 404 }
      );
    }

    const row = orig.rows[0];
    const newId = `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const originalName = (row.name as string) || "Untitled Canvas";
    const newName = body.new_name?.trim() || `${originalName} (Copy)`;

    const maxOrderRes = await db.execute("SELECT MAX(sort_order) as max_order FROM canvases");
    const maxOrder = maxOrderRes.rows[0]?.max_order;
    const nextOrder = typeof maxOrder === "number" ? maxOrder + 1 : 0;

    const elementsStr = (row.elements as string) || "[]";
    const appStateStr = (row.app_state as string) || "{}";
    const filesStr = (row.files as string) || "{}";
    const todosStr = (row.todos as string) || "[]";
    const notesStr = (row.notes as string) || "[]";
    const extStr = (row.extensions_data as string) || "{}";

    let elementCount = 0;
    try {
      const parsed = JSON.parse(elementsStr);
      if (Array.isArray(parsed)) elementCount = parsed.length;
    } catch {
      elementCount = 0;
    }

    await db.batch(
      [
        {
          sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, thumbnail, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          args: [
            newId,
            newName,
            (row.description as string) || "",
            newId,
            nextOrder,
            (row.thumbnail as string) || "",
            now,
            now,
          ],
        },
        {
          sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          args: [newId, elementsStr, appStateStr, filesStr, todosStr, notesStr, extStr, now],
        },
        {
          sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `snap_${now}_clone`,
            newId,
            `Cloned from ${originalName}`,
            elementsStr,
            appStateStr,
            filesStr,
            todosStr,
            notesStr,
            extStr,
            elementCount,
            now,
          ],
        },
      ],
      "write"
    );

    return NextResponse.json(
      {
        success: true,
        canvas: {
          id: newId,
          name: newName,
          description: (row.description as string) || "",
          is_readonly: 0,
          share_slug: newId,
          sort_order: nextOrder,
          thumbnail: (row.thumbnail as string) || "",
          created_at: now,
          updated_at: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
