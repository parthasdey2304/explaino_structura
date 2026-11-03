import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await ensureDb();

    // Polling clients first check a small version record so unchanged scenes
    // do not repeatedly download every element and embedded image.
    const requestedEtag = req.headers.get("if-none-match");
    if (requestedEtag) {
      const versionResult = await db.execute({
        sql: `SELECT c.updated_at, d.version FROM canvases c
              LEFT JOIN canvas_data d ON c.id = d.canvas_id
              WHERE c.id = ? OR c.share_slug = ?`,
        args: [id, id],
      });
      if (versionResult.rows.length === 0) {
        return NextResponse.json({ success: false, error: "Canvas not found" }, { status: 404 });
      }
      const versionRow = versionResult.rows[0];
      const etag = `"${versionRow.version ?? 0}-${versionRow.updated_at}"`;
      if (requestedEtag === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
      }
    }

    const result = await db.execute({
      sql: `SELECT c.id, c.name, c.description, c.share_slug, c.sort_order, c.thumbnail, c.created_at, c.updated_at,
                   d.elements, d.app_state, d.files, d.version
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
    const elements = JSON.parse((row.elements as string) || "[]");
    const appState = JSON.parse((row.app_state as string) || "{}");
    const files = JSON.parse((row.files as string) || "{}");

    // Public share always enforces is_readonly: 1 and viewModeEnabled: true in appState
    const canvas = {
      id: row.id,
      name: row.name,
      description: row.description || "",
      is_readonly: 1,
      share_slug: row.share_slug,
      sort_order: row.sort_order,
      thumbnail: row.thumbnail || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version,
      elements,
      appState: {
        ...appState,
        viewModeEnabled: true,
      },
      files,
    };

    return NextResponse.json(
      { success: true, canvas },
      {
        headers: {
          "Cache-Control": "private, no-cache",
          ETag: `"${row.version ?? 0}-${row.updated_at}"`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
