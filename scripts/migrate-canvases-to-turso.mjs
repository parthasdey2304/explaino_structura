/** Copy the local canvas database to a Turso database without replacing remote rows.
 * Run once with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment.
 * Safe to rerun: existing IDs are left intact.
 */
import { createClient } from "@libsql/client";
import path from "node:path";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!databaseUrl || !authToken || !databaseUrl.startsWith("libsql:")) {
  throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before migrating.");
}

const sourcePath = path.resolve(process.env.LOCAL_CANVAS_DB_PATH || "data/explaino.db").replace(/\\/g, "/");
const source = createClient({ url: `file:${sourcePath}` });
const destination = createClient({ url: databaseUrl, authToken });
const tableNames = ["canvases", "canvas_data", "canvas_history", "canvas_todos", "canvas_notes", "canvas_extensions"];

try {
  const definitions = await source.execute({
    sql: "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
    args: [],
  });
  for (const table of tableNames) {
    const definition = definitions.rows.find((row) => row.name === table && row.type === "table");
    if (!definition) continue;
    await destination.execute(String(definition.sql).replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS "));
  }
  for (const table of tableNames) {
    const result = await source.execute(`SELECT * FROM ${table}`);
    if (!result.rows.length) continue;
    const columns = result.columns;
    const sql = `INSERT OR IGNORE INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    for (let offset = 0; offset < result.rows.length; offset += 50) {
      await destination.batch(result.rows.slice(offset, offset + 50).map((row) => ({
        sql,
        args: columns.map((column) => row[column]),
      })), "write");
    }
    console.log(`${table}: ${result.rows.length} local rows copied or already present`);
  }
  for (const index of definitions.rows.filter((row) => row.type === "index")) {
    await destination.execute(String(index.sql).replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS "));
  }
  console.log("Canvas migration complete.");
} finally {
  source.close();
  destination.close();
}
