import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

export * from "./types";
export type { Client, InStatement, InValue };

let dbInstance: Client | null = null;
let initPromise: Promise<void> | null = null;

export function getDb(): Client {
  if (dbInstance) return dbInstance;

  const remoteUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (!remoteUrl && process.env.VERCEL === "1") {
    throw new Error("Canvas storage is not configured. Connect a Turso database to this Vercel project.");
  }
  let dbUrl = remoteUrl;
  if (!dbUrl) {
    const dbDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.resolve(dbDir, "explaino.db").replace(/\\/g, "/");
    dbUrl = `file:${dbPath}`;
  }

  dbInstance = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN,
  });

  return dbInstance;
}

export async function initDatabase(db: Client): Promise<void> {
  // SQLite safety pragmas must be executed outside a transaction
  if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL?.startsWith("libsql:")) {
    await db.execute("PRAGMA journal_mode = WAL;");
    await db.execute("PRAGMA synchronous = NORMAL;");
    await db.execute("PRAGMA foreign_keys = ON;");
    await db.execute("PRAGMA busy_timeout = 5000;");
  }

  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Untitled Canvas',
        description TEXT DEFAULT '',
        is_readonly INTEGER NOT NULL DEFAULT 0,
        share_slug TEXT UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        thumbnail TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_canvases_sort_order ON canvases(sort_order);`,
      `CREATE INDEX IF NOT EXISTS idx_canvases_updated_at ON canvases(updated_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_canvases_share_slug ON canvases(share_slug);`,
      `CREATE TABLE IF NOT EXISTS canvas_data (
        canvas_id TEXT PRIMARY KEY REFERENCES canvases(id) ON DELETE CASCADE,
        elements TEXT NOT NULL DEFAULT '[]',
        app_state TEXT NOT NULL DEFAULT '{}',
        files TEXT NOT NULL DEFAULT '{}',
        todos TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '[]',
        extensions_data TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS canvas_history (
        id TEXT PRIMARY KEY,
        canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Auto-save',
        elements TEXT NOT NULL DEFAULT '[]',
        app_state TEXT NOT NULL DEFAULT '{}',
        files TEXT NOT NULL DEFAULT '{}',
        todos TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '[]',
        extensions_data TEXT NOT NULL DEFAULT '{}',
        element_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_canvas_history_lookup ON canvas_history(canvas_id, created_at DESC);`,
      `CREATE TABLE IF NOT EXISTS canvas_todos (
        id TEXT PRIMARY KEY,
        canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'inprogress', 'done')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_canvas_todos ON canvas_todos(canvas_id, sort_order);`,
      `CREATE TABLE IF NOT EXISTS canvas_notes (
        id TEXT PRIMARY KEY,
        canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        duration_sec REAL NOT NULL DEFAULT 0,
        mime_type TEXT NOT NULL DEFAULT 'audio/webm',
        audio_data TEXT NOT NULL,
        peaks TEXT NOT NULL DEFAULT '[]',
        region TEXT DEFAULT NULL,
        frames TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_canvas_notes ON canvas_notes(canvas_id, created_at DESC);`,
      `CREATE TABLE IF NOT EXISTS canvas_extensions (
        canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (canvas_id, extension_id)
      );`
    ],
    "write"
  );
}

export async function ensureDb(): Promise<Client> {
  const db = getDb();
  if (!initPromise) {
    initPromise = initDatabase(db).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return db;
}
