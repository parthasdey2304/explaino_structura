import { NextRequest, NextResponse } from "next/server";
import { ensureDb, type InStatement, type InValue } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await ensureDb();
    const result = await db.execute({
      sql: `SELECT c.id, c.name, c.description, c.is_readonly, c.share_slug, c.sort_order, c.thumbnail, c.created_at, c.updated_at,
                   d.elements, d.app_state, d.files, d.todos, d.notes, d.extensions_data, d.version
            FROM canvases c
            LEFT JOIN canvas_data d ON c.id = d.canvas_id
            WHERE c.id = ? OR c.share_slug = ?`,
      args: [id, id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Canvas not found" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const canvas = {
      id: row.id,
      name: row.name,
      description: row.description || "",
      is_readonly: row.is_readonly,
      share_slug: row.share_slug,
      sort_order: row.sort_order,
      thumbnail: row.thumbnail || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version,
      elements: JSON.parse((row.elements as string) || "[]"),
      appState: JSON.parse((row.app_state as string) || "{}"),
      files: JSON.parse((row.files as string) || "{}"),
      todos: JSON.parse((row.todos as string) || "[]"),
      notes: JSON.parse((row.notes as string) || "[]"),
      extensionsData: JSON.parse((row.extensions_data as string) || "{}"),
    };

    return NextResponse.json({ success: true, canvas });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await ensureDb();
    const now = Date.now();

    // Verify canvas exists
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

    const batch: InStatement[] = [];

    // 1. Update canvases metadata if provided
    const updateCanvasFields: string[] = [];
    const updateCanvasArgs: InValue[] = [];

    if (body.name !== undefined) {
      updateCanvasFields.push("name = ?");
      updateCanvasArgs.push(body.name.trim());
    }
    if (body.description !== undefined) {
      updateCanvasFields.push("description = ?");
      updateCanvasArgs.push(body.description);
    }
    if (body.is_readonly !== undefined) {
      updateCanvasFields.push("is_readonly = ?");
      updateCanvasArgs.push(body.is_readonly ? 1 : 0);
    }
    if (body.sort_order !== undefined) {
      updateCanvasFields.push("sort_order = ?");
      updateCanvasArgs.push(body.sort_order);
    }
    if (body.thumbnail !== undefined) {
      updateCanvasFields.push("thumbnail = ?");
      updateCanvasArgs.push(body.thumbnail);
    }

    if (updateCanvasFields.length > 0) {
      updateCanvasFields.push("updated_at = ?");
      updateCanvasArgs.push(now);
      updateCanvasArgs.push(id);
      batch.push({
        sql: `UPDATE canvases SET ${updateCanvasFields.join(", ")} WHERE id = ?`,
        args: updateCanvasArgs,
      });
    }

    // 2. Update canvas_data if provided
    const updateDataFields: string[] = [];
    const updateDataArgs: InValue[] = [];

    if (body.elements !== undefined) {
      updateDataFields.push("elements = ?");
      updateDataArgs.push(JSON.stringify(body.elements));
    }
    if (body.appState !== undefined) {
      updateDataFields.push("app_state = ?");
      updateDataArgs.push(JSON.stringify(body.appState));
    }
    if (body.files !== undefined) {
      updateDataFields.push("files = ?");
      updateDataArgs.push(JSON.stringify(body.files));
    }
    if (body.todos !== undefined) {
      updateDataFields.push("todos = ?");
      updateDataArgs.push(JSON.stringify(body.todos));
    }
    if (body.notes !== undefined) {
      updateDataFields.push("notes = ?");
      updateDataArgs.push(JSON.stringify(body.notes));
    }
    if (body.extensionsData !== undefined) {
      updateDataFields.push("extensions_data = ?");
      updateDataArgs.push(JSON.stringify(body.extensionsData));
    }

    if (updateDataFields.length > 0) {
      updateDataFields.push("version = version + 1");
      updateDataFields.push("updated_at = ?");
      updateDataArgs.push(now);
      updateDataArgs.push(id);
      batch.push({
        sql: `UPDATE canvas_data SET ${updateDataFields.join(", ")} WHERE canvas_id = ?`,
        args: updateDataArgs,
      });

      // Always update canvases.updated_at when canvas_data changes
      if (updateCanvasFields.length === 0) {
        batch.push({
          sql: `UPDATE canvases SET updated_at = ? WHERE id = ?`,
          args: [now, id],
        });
      }
    }

    // 3. Optional snapshot checkpoint
    if (body.create_snapshot) {
      batch.push({
        sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
              SELECT ?, canvas_id, ?, elements, app_state, files, todos, notes, extensions_data, ?, ?
              FROM canvas_data WHERE canvas_id = ?`,
        args: [
          `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
          body.snapshot_label || "Auto Checkpoint",
          Array.isArray(body.elements) ? body.elements.length : 0,
          now,
          id,
        ],
      });
    }

    if (batch.length > 0) {
      await db.batch(batch, "write");
    }

    return NextResponse.json({ success: true, updated_at: now });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await ensureDb();

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

    await db.execute({
      sql: `DELETE FROM canvases WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true, deleted_id: id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
