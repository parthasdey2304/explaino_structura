import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await ensureDb();
    const { searchParams } = new URL(req.url);
    const includeData = searchParams.get("include_data") === "true";
    const initialOnly = searchParams.get("initial_only") === "true";
    const initialCanvas = searchParams.get("initial_canvas") || "";

    if (includeData) {
      const result = await db.execute({
        sql: `SELECT c.id, c.name, c.description, c.is_readonly, c.share_slug, c.sort_order, c.thumbnail, c.created_at, c.updated_at,
                     d.elements, d.app_state, d.files, d.todos, d.notes, d.extensions_data, d.version
              FROM canvases c
              LEFT JOIN canvas_data d ON c.id = d.canvas_id ${initialOnly ? `AND c.id = COALESCE(
                (SELECT id FROM canvases WHERE id = ? OR share_slug = ? LIMIT 1),
                (SELECT id FROM canvases ORDER BY sort_order ASC, updated_at DESC LIMIT 1))` : ""}
              ORDER BY c.sort_order ASC, c.updated_at DESC`,
        args: initialOnly ? [initialCanvas, initialCanvas] : [],
      });

      const canvases = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || "",
        is_readonly: row.is_readonly,
        share_slug: row.share_slug,
        sort_order: row.sort_order,
        thumbnail: row.thumbnail || "",
        created_at: row.created_at,
        updated_at: row.updated_at,
        data_loaded: !initialOnly || row.elements !== null,
        elements: JSON.parse((row.elements as string) || "[]"),
        appState: JSON.parse((row.app_state as string) || "{}"),
        files: JSON.parse((row.files as string) || "{}"),
        todos: JSON.parse((row.todos as string) || "[]"),
        notes: JSON.parse((row.notes as string) || "[]"),
        extensionsData: JSON.parse((row.extensions_data as string) || "{}"),
      }));

      return NextResponse.json({ success: true, canvases });
    }

    const result = await db.execute({
      sql: `SELECT id, name, description, is_readonly, share_slug, sort_order, thumbnail, created_at, updated_at
            FROM canvases
            ORDER BY sort_order ASC, updated_at DESC`,
      args: [],
    });

    return NextResponse.json({ success: true, canvases: result.rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await ensureDb();
    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    const id = body.id || `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const name = body.name?.trim() || "Untitled Canvas";

    // Find highest sort_order
    const maxOrderRes = await db.execute("SELECT MAX(sort_order) as max_order FROM canvases");
    const maxOrder = maxOrderRes.rows[0]?.max_order;
    const nextOrder = typeof maxOrder === "number" ? maxOrder + 1 : 0;

    const elementsStr = JSON.stringify(body.elements || []);
    const appStateStr = JSON.stringify(body.appState || {});
    const filesStr = JSON.stringify(body.files || {});
    const todosStr = JSON.stringify(body.todos || []);
    const notesStr = JSON.stringify(body.notes || []);
    const extStr = JSON.stringify(body.extensionsData || {});
    const isReadOnly = body.is_readonly ? 1 : 0;
    const shareSlug = body.share_slug || id;

    await db.batch(
      [
        {
          sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, thumbnail, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            name,
            body.description || "",
            isReadOnly,
            shareSlug,
            nextOrder,
            body.thumbnail || "",
            now,
            now,
          ],
        },
        {
          sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          args: [id, elementsStr, appStateStr, filesStr, todosStr, notesStr, extStr, now],
        },
        {
          sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
                VALUES (?, ?, 'Initial Creation', ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `snap_${now}_init`,
            id,
            elementsStr,
            appStateStr,
            filesStr,
            todosStr,
            notesStr,
            extStr,
            Array.isArray(body.elements) ? body.elements.length : 0,
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
          id,
          name,
          description: body.description || "",
          is_readonly: isReadOnly,
          share_slug: shareSlug,
          sort_order: nextOrder,
          thumbnail: body.thumbnail || "",
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
