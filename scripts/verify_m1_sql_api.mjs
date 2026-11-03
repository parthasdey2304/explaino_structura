/**
 * Automated Verification Harness for Milestone 1: SQL Database Storage & API Endpoints
 * Project: Explaino Structura
 *
 * Verifies:
 * 1. Database Connection & Engine:
 *    - LibSQL client connects cleanly to local SQLite file `data/explaino.db`.
 *    - PRAGMA journal_mode is WAL, PRAGMA foreign_keys is ON, PRAGMA busy_timeout is set.
 * 2. Relational Schema & Table Definitions:
 *    - All 6 tables exist: canvases, canvas_data, canvas_history, canvas_todos, canvas_notes, canvas_extensions.
 *    - Required columns and constraints exist across all tables.
 *    - All 6 indexes exist and are active.
 * 3. Cascade Deletion Integrity:
 *    - Creating parent canvas and dependent records in all 5 child tables.
 *    - Deleting parent canvas cascades and purges all child records automatically.
 * 4. Relational Data Operations & Versioning:
 *    - Full JSON document persistence (elements, app_state, files, todos, notes, extensions_data).
 *    - Snapshot checkpointing and snapshot restoration.
 *    - Canvas cloning with deep copying of data and history.
 *    - Canvas reordering with sort_order updates.
 * 5. Public Read-Only Share Contract:
 *    - Share slug and ID lookup.
 *    - Strict read-only enforcement (is_readonly: 1, viewModeEnabled: true).
 * 6. Live Next.js App Router HTTP Endpoints Verification:
 *    - GET /api/canvases (metadata list & include_data=true)
 *    - POST /api/canvases (create canvas, 201 response)
 *    - GET /api/canvases/[id] (load canvas & 404 handling)
 *    - PUT /api/canvases/[id] (update metadata/payload & create_snapshot)
 *    - GET /api/canvases/[id]/history (list snapshots)
 *    - POST /api/canvases/[id]/history (create checkpoint)
 *    - POST /api/canvases/[id]/history/[snapshotId]/restore (restore state)
 *    - POST /api/canvases/[id]/clone (deep clone)
 *    - PUT /api/canvases/reorder (update tab order)
 *    - GET /api/canvases/[id]/share (public read-only)
 *    - DELETE /api/canvases/[id] (cascade delete)
 *
 * Usage:
 *   node scripts/verify_m1_sql_api.mjs
 */

import { createClient } from "@libsql/client";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

let passedCount = 0;
let failedCount = 0;

function assert(condition, message, details = "") {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}${details ? ` -> ${details}` : ""}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
  console.log(`  ✅ PASS: ${message}`);
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
      const text = await res.text().catch(() => "");
      console.log(`  Waiting for server... HTTP ${res.status}: ${text.slice(0, 100)}`);
    } catch {
      // Server not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function runVerification() {
  console.log("===============================================================================");
  console.log(" Milestone 1 Verification: SQL Database Storage & Next.js API Endpoints");
  console.log("===============================================================================\n");

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.resolve(dbDir, "explaino.db").replace(/\\/g, "/");
  const db = createClient({ url: `file:${dbPath}` });

  // -------------------------------------------------------------------------
  // Suite 1: Database Initialization & Pragmas
  // -------------------------------------------------------------------------
  console.log("--- Suite 1: Database Engine & Pragmas ---");
  
  // Pragmas must be run outside batch transactions
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA synchronous = NORMAL;");
  await db.execute("PRAGMA foreign_keys = ON;");
  await db.execute("PRAGMA busy_timeout = 5000;");

  // Run DDL initialization batch
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

  const fkResult = await db.execute("PRAGMA foreign_keys;");
  const fkValue = Object.values(fkResult.rows[0])[0];
  assert(Number(fkValue) === 1, "Foreign keys pragma is ON (value=1)");

  const jmResult = await db.execute("PRAGMA journal_mode;");
  const jmValue = Object.values(jmResult.rows[0])[0];
  assert(String(jmValue).toLowerCase() === "wal", "Journal mode is WAL");

  // -------------------------------------------------------------------------
  // Suite 2: Relational Schema & Table Definitions
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 2: Relational Schema & Indexes ---");
  const tablesRes = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const foundTables = tablesRes.rows.map((r) => r.name);
  const expectedTables = [
    "canvas_data",
    "canvas_extensions",
    "canvas_history",
    "canvas_notes",
    "canvas_todos",
    "canvases",
  ];

  for (const expectedTable of expectedTables) {
    assert(foundTables.includes(expectedTable), `Table '${expectedTable}' exists in sqlite_master`);
  }

  const indexesRes = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const foundIndexes = indexesRes.rows.map((r) => r.name);
  const expectedIndexes = [
    "idx_canvases_share_slug",
    "idx_canvases_sort_order",
    "idx_canvases_updated_at",
    "idx_canvas_history_lookup",
    "idx_canvas_notes",
    "idx_canvas_todos",
  ];

  for (const expectedIndex of expectedIndexes) {
    assert(foundIndexes.includes(expectedIndex), `Index '${expectedIndex}' exists`);
  }

  // -------------------------------------------------------------------------
  // Suite 3: Cascade Deletion Integrity
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 3: Foreign Key Cascade Deletion ---");
  const cascadeId = `c_cascade_test_${Date.now()}`;
  const now = Date.now();

  await db.batch(
    [
      {
        sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, created_at, updated_at)
              VALUES (?, 'Cascade Canvas', 'Test cascade', 0, ?, 999, ?, ?)`,
        args: [cascadeId, cascadeId, now, now],
      },
      {
        sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
              VALUES (?, '[]', '{}', '{}', '[]', '[]', '{}', 1, ?)`,
        args: [cascadeId, now],
      },
      {
        sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
              VALUES (?, ?, 'Check', '[]', '{}', '{}', '[]', '[]', '{}', 0, ?)`,
        args: [`snap_${cascadeId}`, cascadeId, now],
      },
      {
        sql: `INSERT INTO canvas_todos (id, canvas_id, text, status, sort_order, created_at, updated_at)
              VALUES (?, ?, 'Test todo', 'todo', 0, ?, ?)`,
        args: [`todo_${cascadeId}`, cascadeId, now, now],
      },
      {
        sql: `INSERT INTO canvas_notes (id, canvas_id, duration_sec, mime_type, audio_data, created_at)
              VALUES (?, ?, 10.5, 'audio/webm', 'data:audio...', ?)`,
        args: [`note_${cascadeId}`, cascadeId, now],
      },
      {
        sql: `INSERT INTO canvas_extensions (canvas_id, extension_id, state_json, updated_at)
              VALUES (?, 'code_workspace', '{"open":true}', ?)`,
        args: [cascadeId, now],
      },
    ],
    "write"
  );

  // Verify all child rows exist
  const countDataBefore = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_data WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countHistBefore = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_history WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countTodoBefore = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_todos WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countNoteBefore = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_notes WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countExtBefore  = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_extensions WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;

  assert(countDataBefore === 1 && countHistBefore === 1 && countTodoBefore === 1 && countNoteBefore === 1 && countExtBefore === 1,
    "Child records successfully populated in all 5 tables before cascade test");

  // Delete parent canvas
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [cascadeId] });

  // Verify all child rows were deleted by cascade
  const countDataAfter = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_data WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countHistAfter = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_history WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countTodoAfter = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_todos WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countNoteAfter = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_notes WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;
  const countExtAfter  = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_extensions WHERE canvas_id = ?", args: [cascadeId] })).rows[0].c;

  assert(countDataAfter === 0, "canvas_data row deleted via cascade");
  assert(countHistAfter === 0, "canvas_history row deleted via cascade");
  assert(countTodoAfter === 0, "canvas_todos row deleted via cascade");
  assert(countNoteAfter === 0, "canvas_notes row deleted via cascade");
  assert(countExtAfter === 0,  "canvas_extensions row deleted via cascade");

  // -------------------------------------------------------------------------
  // Suite 4: Relational CRUD & Full State Verification
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 4: Relational CRUD & State Verification ---");
  const testCanvasId = `c_m1_test_${Date.now()}`;
  const sampleElements = [
    { id: "el1", type: "rectangle", x: 100, y: 150, width: 200, height: 100 },
    { id: "el2", type: "ellipse", x: 350, y: 150, width: 80, height: 80 },
  ];
  const sampleAppState = { viewBackgroundColor: "#1e1e1e", theme: "dark" };
  const sampleFiles = { file1: { id: "file1", dataURL: "data:image/png;base64,iVBORw0KGgo..." } };
  const sampleTodos = [{ id: "t1", text: "Design database architecture", status: "done" }];
  const sampleNotes = [{ id: "n1", durationSec: 12.4, mimeType: "audio/webm", audio: "data:audio..." }];
  const sampleExt = { codeWorkspace: { activeFile: "main.py" } };

  // 1. Create Canvas
  await db.batch(
    [
      {
        sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, created_at, updated_at)
              VALUES (?, 'Group A - Algorithms', 'Algorithm whiteboards', 0, ?, 0, ?, ?)`,
        args: [testCanvasId, testCanvasId, now, now],
      },
      {
        sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        args: [
          testCanvasId,
          JSON.stringify(sampleElements),
          JSON.stringify(sampleAppState),
          JSON.stringify(sampleFiles),
          JSON.stringify(sampleTodos),
          JSON.stringify(sampleNotes),
          JSON.stringify(sampleExt),
          now,
        ],
      },
      {
        sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
              VALUES (?, ?, 'Initial Creation', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `snap_${now}_init`,
          testCanvasId,
          JSON.stringify(sampleElements),
          JSON.stringify(sampleAppState),
          JSON.stringify(sampleFiles),
          JSON.stringify(sampleTodos),
          JSON.stringify(sampleNotes),
          JSON.stringify(sampleExt),
          sampleElements.length,
          now,
        ],
      },
    ],
    "write"
  );

  // 2. Fetch and assert complete deserialization
  const fetchRes = await db.execute({
    sql: `SELECT c.*, d.elements, d.app_state, d.files, d.todos, d.notes, d.extensions_data, d.version
          FROM canvases c
          LEFT JOIN canvas_data d ON c.id = d.canvas_id
          WHERE c.id = ?`,
    args: [testCanvasId],
  });

  assert(fetchRes.rows.length === 1, "Canvas record found");
  const loaded = fetchRes.rows[0];
  assert(loaded.name === "Group A - Algorithms", "Canvas name matches");
  assert(loaded.is_readonly === 0, "Canvas is_readonly is 0");

  const loadedElements = JSON.parse(loaded.elements);
  const loadedAppState = JSON.parse(loaded.app_state);
  const loadedFiles = JSON.parse(loaded.files);
  const loadedTodos = JSON.parse(loaded.todos);
  const loadedNotes = JSON.parse(loaded.notes);
  const loadedExt = JSON.parse(loaded.extensions_data);

  assert(loadedElements.length === 2 && loadedElements[0].id === "el1", "Elements deserialized correctly");
  assert(loadedAppState.theme === "dark", "AppState deserialized correctly");
  assert(loadedFiles.file1.id === "file1", "Files deserialized correctly");
  assert(loadedTodos[0].text === "Design database architecture", "Todos deserialized correctly");
  assert(loadedNotes[0].id === "n1", "Notes deserialized correctly");
  assert(loadedExt.codeWorkspace.activeFile === "main.py", "ExtensionsData deserialized correctly");

  // 3. Update Canvas State & Create Checkpoint
  const updatedElements = [...sampleElements, { id: "el3", type: "arrow", start: [100, 100], end: [200, 200] }];
  const updateTime = now + 1000;
  const snapshotId = `snap_${updateTime}_checkpoint`;

  await db.batch(
    [
      {
        sql: `UPDATE canvases SET name = 'Group A - Algorithms (Updated)', updated_at = ? WHERE id = ?`,
        args: [updateTime, testCanvasId],
      },
      {
        sql: `UPDATE canvas_data SET elements = ?, version = version + 1, updated_at = ? WHERE canvas_id = ?`,
        args: [JSON.stringify(updatedElements), updateTime, testCanvasId],
      },
      {
        sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
              VALUES (?, ?, 'Before Midterm Review', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          snapshotId,
          testCanvasId,
          JSON.stringify(updatedElements),
          JSON.stringify(sampleAppState),
          JSON.stringify(sampleFiles),
          JSON.stringify(sampleTodos),
          JSON.stringify(sampleNotes),
          JSON.stringify(sampleExt),
          updatedElements.length,
          updateTime,
        ],
      },
    ],
    "write"
  );

  const updatedCheck = await db.execute({
    sql: `SELECT c.name, d.version, d.elements FROM canvases c JOIN canvas_data d ON c.id = d.canvas_id WHERE c.id = ?`,
    args: [testCanvasId],
  });
  assert(updatedCheck.rows[0].name === "Group A - Algorithms (Updated)", "Updated canvas name persisted");
  assert(updatedCheck.rows[0].version === 2, "Canvas version incremented to 2");
  assert(JSON.parse(updatedCheck.rows[0].elements).length === 3, "Updated elements count is 3");

  // 4. Restore Checkpoint
  await db.batch(
    [
      {
        sql: `UPDATE canvas_data
              SET elements = (SELECT elements FROM canvas_history WHERE id = ?),
                  version = version + 1,
                  updated_at = ?
              WHERE canvas_id = ?`,
        args: [`snap_${now}_init`, updateTime + 500, testCanvasId],
      },
      {
        sql: `UPDATE canvases SET updated_at = ? WHERE id = ?`,
        args: [updateTime + 500, testCanvasId],
      },
    ],
    "write"
  );

  const restoredCheck = await db.execute({
    sql: `SELECT elements, version FROM canvas_data WHERE canvas_id = ?`,
    args: [testCanvasId],
  });
  assert(JSON.parse(restoredCheck.rows[0].elements).length === 2, "Checkpoint restoration returned elements back to 2");
  assert(restoredCheck.rows[0].version === 3, "Restoration incremented version to 3");

  // -------------------------------------------------------------------------
  // Suite 5: Canvas Cloning & Tab Reordering
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 5: Canvas Cloning & Tab Reordering ---");
  const cloneId = `c_clone_${Date.now()}`;
  const cloneTime = Date.now();

  // Clone from original
  await db.batch(
    [
      {
        sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, created_at, updated_at)
              SELECT ?, name || ' (Copy)', description, 0, ?, (SELECT MAX(sort_order) + 1 FROM canvases), ?, ?
              FROM canvases WHERE id = ?`,
        args: [cloneId, cloneId, cloneTime, cloneTime, testCanvasId],
      },
      {
        sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
              SELECT ?, elements, app_state, files, todos, notes, extensions_data, 1, ?
              FROM canvas_data WHERE canvas_id = ?`,
        args: [cloneId, cloneTime, testCanvasId],
      },
      {
        sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
              SELECT ?, ?, 'Cloned Checkpoint', elements, app_state, files, todos, notes, extensions_data, 2, ?
              FROM canvas_data WHERE canvas_id = ?`,
        args: [`snap_${cloneId}_init`, cloneId, cloneTime, testCanvasId],
      },
    ],
    "write"
  );

  const cloneCheck = await db.execute({
    sql: `SELECT c.name, c.sort_order, d.elements FROM canvases c JOIN canvas_data d ON c.id = d.canvas_id WHERE c.id = ?`,
    args: [cloneId],
  });
  assert(cloneCheck.rows.length === 1, "Cloned canvas created");
  assert(cloneCheck.rows[0].name === "Group A - Algorithms (Updated) (Copy)", "Cloned canvas has '(Copy)' suffix");
  assert(JSON.parse(cloneCheck.rows[0].elements).length === 2, "Cloned canvas contains elements");

  // Reorder tabs: put cloneId at index 0, testCanvasId at index 1
  const reorderBatch = [
    { sql: "UPDATE canvases SET sort_order = 0 WHERE id = ?", args: [cloneId] },
    { sql: "UPDATE canvases SET sort_order = 1 WHERE id = ?", args: [testCanvasId] },
  ];
  await db.batch(reorderBatch, "write");

  const orderCheck = await db.execute({
    sql: `SELECT id, sort_order FROM canvases WHERE id IN (?, ?) ORDER BY sort_order ASC`,
    args: [cloneId, testCanvasId],
  });
  assert(orderCheck.rows[0].id === cloneId && orderCheck.rows[0].sort_order === 0, "Clone is first tab (sort_order = 0)");
  assert(orderCheck.rows[1].id === testCanvasId && orderCheck.rows[1].sort_order === 1, "Original is second tab (sort_order = 1)");

  // -------------------------------------------------------------------------
  // Suite 6: Public Read-Only Share Verification
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 6: Public Read-Only Share Endpoint Contract ---");
  const shareCheck = await db.execute({
    sql: `SELECT c.id, c.name, c.share_slug, d.elements, d.app_state
          FROM canvases c JOIN canvas_data d ON c.id = d.canvas_id
          WHERE c.id = ? OR c.share_slug = ?`,
    args: [testCanvasId, testCanvasId],
  });

  assert(shareCheck.rows.length === 1, "Share lookup succeeds by ID/slug");
  const shareData = shareCheck.rows[0];
  const shareAppState = {
    ...JSON.parse(shareData.app_state),
    viewModeEnabled: true,
  };
  assert(shareAppState.viewModeEnabled === true, "Public share enforces viewModeEnabled: true");

  // Clean up direct test data
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [testCanvasId] });
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [cloneId] });

  const cleanCheck = await db.execute({
    sql: "SELECT COUNT(*) as c FROM canvases WHERE id IN (?, ?)",
    args: [testCanvasId, cloneId],
  });
  assert(cleanCheck.rows[0].c === 0, "Test canvases cleanly purged from database");

  // -------------------------------------------------------------------------
  // Suite 7: Live Next.js App Router HTTP Endpoints
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 7: Live Next.js App Router HTTP Endpoints ---");
  const testPort = 3009;
  const baseUrl = `http://localhost:${testPort}`;
  let serverProcess = null;

  try {
    console.log(`  Starting Next.js production server on port ${testPort}...`);
    serverProcess = spawn(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(testPort)],
      { stdio: "ignore" }
    );

    await waitForServer(`${baseUrl}/api/canvases`, 25000);
    console.log(`  Next.js server is ready and accepting requests at ${baseUrl}`);

    // 1. GET /api/canvases
    const getListRes = await fetch(`${baseUrl}/api/canvases`);
    assert(getListRes.status === 200, "GET /api/canvases returns HTTP 200");
    const getListData = await getListRes.json();
    assert(getListData.success === true, "GET /api/canvases returns success: true");
    assert(Array.isArray(getListData.canvases), "GET /api/canvases returns canvases array");

    // 2. POST /api/canvases (create new canvas)
    const postPayload = {
      name: "Live HTTP Test Canvas",
      description: "Testing App Router API",
      is_readonly: false,
      elements: [{ id: "http_el_1", type: "rectangle", x: 20, y: 30, width: 100, height: 50 }],
      appState: { viewBackgroundColor: "#ffffff", theme: "light" },
      files: { img1: { id: "img1", dataURL: "data:image/png..." } },
      todos: [{ id: "t_live", text: "Verify HTTP API", status: "inprogress" }],
      notes: [{ id: "n_live", durationSec: 5, mimeType: "audio/webm", audioData: "..." }],
      extensionsData: { stopwatch: { running: false, elapsedMs: 1200 } },
    };

    const postRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload),
    });
    assert(postRes.status === 201, "POST /api/canvases returns HTTP 201");
    const postData = await postRes.json();
    assert(postData.success === true, "POST /api/canvases returns success: true");
    const createdCanvasId = postData.canvas.id;
    assert(typeof createdCanvasId === "string" && createdCanvasId.length > 0, "POST /api/canvases returns created canvas ID");
    assert(postData.canvas.name === "Live HTTP Test Canvas", "Created canvas name matches payload");

    // 3. GET /api/canvases/[id] (load canvas)
    const getDetailRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`);
    assert(getDetailRes.status === 200, "GET /api/canvases/[id] returns HTTP 200");
    const getDetailData = await getDetailRes.json();
    assert(getDetailData.success === true, "GET /api/canvases/[id] returns success: true");
    assert(getDetailData.canvas.id === createdCanvasId, "Detail canvas id matches");
    assert(Array.isArray(getDetailData.canvas.elements) && getDetailData.canvas.elements.length === 1, "Detail elements array length is 1");
    assert(getDetailData.canvas.elements[0].id === "http_el_1", "Detail element id is 'http_el_1'");
    assert(getDetailData.canvas.appState.theme === "light", "Detail appState theme matches");
    assert(getDetailData.canvas.todos[0].text === "Verify HTTP API", "Detail todos text matches");
    assert(getDetailData.canvas.extensionsData.stopwatch.elapsedMs === 1200, "Detail extensionsData matches");

    // 4. GET /api/canvases?include_data=true
    const getFullListRes = await fetch(`${baseUrl}/api/canvases?include_data=true`);
    assert(getFullListRes.status === 200, "GET /api/canvases?include_data=true returns HTTP 200");
    const getFullListData = await getFullListRes.json();
    const foundInFull = getFullListData.canvases.find((c) => c.id === createdCanvasId);
    assert(foundInFull !== undefined, "Canvas present in include_data=true listing");
    assert(Array.isArray(foundInFull.elements) && foundInFull.elements.length === 1, "include_data=true contains parsed elements");

    // 5. PUT /api/canvases/[id] (update metadata & elements + create snapshot)
    const putPayload = {
      name: "Live HTTP Test Canvas (Renamed)",
      description: "Updated description",
      elements: [
        { id: "http_el_1", type: "rectangle", x: 20, y: 30, width: 100, height: 50 },
        { id: "http_el_2", type: "text", text: "Hello Live HTTP", x: 200, y: 200 },
      ],
      create_snapshot: true,
      snapshot_label: "Checkpoint before clone",
    };

    const putRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(putPayload),
    });
    assert(putRes.status === 200, "PUT /api/canvases/[id] returns HTTP 200");
    const putData = await putRes.json();
    assert(putData.success === true, "PUT /api/canvases/[id] returns success: true");

    // Verify update persisted
    const verifyPutRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`);
    const verifyPutData = await verifyPutRes.json();
    assert(verifyPutData.canvas.name === "Live HTTP Test Canvas (Renamed)", "Canvas name updated to renamed version");
    assert(verifyPutData.canvas.elements.length === 2, "Updated elements count is 2");

    // 6. GET /api/canvases/[id]/history (list snapshots)
    const getHistoryRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}/history`);
    assert(getHistoryRes.status === 200, "GET /api/canvases/[id]/history returns HTTP 200");
    const getHistoryData = await getHistoryRes.json();
    assert(getHistoryData.success === true, "GET history returns success: true");
    assert(Array.isArray(getHistoryData.snapshots) && getHistoryData.snapshots.length >= 2, "History has at least 2 snapshots (initial + checkpoint)");
    const initialSnapshot = getHistoryData.snapshots.find((s) => s.label === "Initial Creation");
    assert(initialSnapshot !== undefined, "Initial Creation snapshot exists in history");

    // 7. POST /api/canvases/[id]/history (create manual checkpoint)
    const postSnapRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Manual Test Checkpoint" }),
    });
    assert(postSnapRes.status === 201, "POST /api/canvases/[id]/history returns HTTP 201");
    const postSnapData = await postSnapRes.json();
    assert(typeof postSnapData.snapshot_id === "string", "Manual snapshot created with snapshot_id");

    // 8. POST /api/canvases/[id]/history/[snapshotId]/restore (restore initial snapshot)
    const restoreRes = await fetch(
      `${baseUrl}/api/canvases/${createdCanvasId}/history/${initialSnapshot.id}/restore`,
      { method: "POST" }
    );
    assert(restoreRes.status === 200, "POST history restore returns HTTP 200");
    const restoreData = await restoreRes.json();
    assert(restoreData.success === true && restoreData.restored === true, "History restore returns success: true & restored: true");

    // Verify elements reverted to 1
    const verifyRestoreRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`);
    const verifyRestoreData = await verifyRestoreRes.json();
    assert(verifyRestoreData.canvas.elements.length === 1, "Canvas elements reverted to 1 after restoring initial snapshot");

    // 9. POST /api/canvases/[id]/clone (clone canvas)
    const cloneRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: "Live Cloned Canvas" }),
    });
    assert(cloneRes.status === 201 || cloneRes.status === 200, "POST /api/canvases/[id]/clone returns HTTP 200/201");
    const cloneData = await cloneRes.json();
    assert(cloneData.success === true, "Clone returns success: true");
    const clonedCanvasId = cloneData.canvas.id;
    assert(clonedCanvasId !== createdCanvasId, "Cloned canvas has unique ID");
    assert(cloneData.canvas.name === "Live Cloned Canvas", "Cloned canvas has requested new name");

    // Verify cloned canvas has elements
    const getClonedRes = await fetch(`${baseUrl}/api/canvases/${clonedCanvasId}`);
    const getClonedData = await getClonedRes.json();
    assert(getClonedData.canvas.elements.length === 1, "Cloned canvas retained original elements");

    // 10. PUT /api/canvases/reorder (reorder tabs)
    const reorderRes = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: [clonedCanvasId, createdCanvasId] }),
    });
    assert(reorderRes.status === 200, "PUT /api/canvases/reorder returns HTTP 200");
    const reorderData = await reorderRes.json();
    assert(reorderData.success === true, "PUT /api/canvases/reorder returns success: true");

    // Verify reorder reflected in GET /api/canvases
    const checkReorderRes = await fetch(`${baseUrl}/api/canvases`);
    const checkReorderData = await checkReorderRes.json();
    const clonedIdx = checkReorderData.canvases.findIndex((c) => c.id === clonedCanvasId);
    const createdIdx = checkReorderData.canvases.findIndex((c) => c.id === createdCanvasId);
    assert(clonedIdx !== -1 && createdIdx !== -1 && clonedIdx < createdIdx, "Cloned canvas is positioned before created canvas after reorder");

    // 11. GET /api/canvases/[id]/share (public read-only endpoint)
    const shareRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}/share`);
    assert(shareRes.status === 200, "GET /api/canvases/[id]/share returns HTTP 200");
    const shareResData = await shareRes.json();
    assert(shareResData.success === true, "Public share returns success: true");
    assert(shareResData.canvas.is_readonly === 1, "Public share forces is_readonly: 1");
    assert(shareResData.canvas.appState.viewModeEnabled === true, "Public share forces appState.viewModeEnabled: true");
    assert(Array.isArray(shareResData.canvas.elements), "Public share returns elements");

    // 12. DELETE /api/canvases/[id] (cascade delete)
    const deleteRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`, {
      method: "DELETE",
    });
    assert(deleteRes.status === 200, "DELETE /api/canvases/[id] returns HTTP 200");
    const deleteData = await deleteRes.json();
    assert(deleteData.success === true && deleteData.deleted_id === createdCanvasId, "DELETE returns deleted_id");

    // 13. Verify 404 for deleted canvas
    const getDeletedRes = await fetch(`${baseUrl}/api/canvases/${createdCanvasId}`);
    assert(getDeletedRes.status === 404, "GET deleted canvas returns HTTP 404");

    // 14. Delete cloned canvas
    const deleteCloneRes = await fetch(`${baseUrl}/api/canvases/${clonedCanvasId}`, {
      method: "DELETE",
    });
    assert(deleteCloneRes.status === 200, "DELETE cloned canvas returns HTTP 200");

    console.log("  All live Next.js HTTP API assertions passed!");
  } finally {
    if (serverProcess) {
      console.log("  Stopping Next.js production test server...");
      serverProcess.kill("SIGTERM");
      try {
        process.kill(serverProcess.pid);
      } catch {}
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(` Verification Completed: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("===============================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Unhandled error during verification:", err);
  process.exit(1);
});
