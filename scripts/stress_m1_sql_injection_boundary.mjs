/**
 * Adversarial Stress & Empirical Challenge Harness for Milestone 1:
 * SQL Storage, API Endpoints, Injection Resistance, Malformed JSON,
 * Boundary Conditions & Cascade Deletion Integrity.
 *
 * Project: Explaino Structura
 * Agent: challenger_m1_2 (Empirical Challenger)
 *
 * Verifies:
 * 1. SQL Injection Resistance (name, description, id, share_slug, sort_order, label, order array)
 * 2. Malformed / Truncated JSON & Type Fuzzing (HTTP payload & database columns)
 * 3. Boundary Conditions & Negative Testing (non-existent IDs, invalid snapshots, cross-canvas isolation, negative sort_orders)
 * 4. Foreign Key Cascade Deletion Under Multi-Record Stress (verifies zero orphaned rows across all 5 child tables)
 * 5. High-Load Boundary Stress (large payloads, rapid sequential mutations, unicode/control chars)
 */

import { createClient } from "@libsql/client";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(condition, message, details = "") {
  if (!condition) {
    failedCount++;
    const errMsg = `${message}${details ? ` -> ${details}` : ""}`;
    failures.push(errMsg);
    console.error(`  ❌ FAIL: ${errMsg}`);
  } else {
    passedCount++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {
      // server starting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function runAdversarialStress() {
  console.log("===============================================================================");
  console.log(" Adversarial Empirical Stress Test Suite: Milestone 1 SQL & API");
  console.log("===============================================================================\n");

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.resolve(dbDir, "explaino.db").replace(/\\/g, "/");
  const db = createClient({ url: `file:${dbPath}` });

  // Ensure DB pragmas and tables are present
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA synchronous = NORMAL;");
  await db.execute("PRAGMA foreign_keys = ON;");
  await db.execute("PRAGMA busy_timeout = 5000;");

  let baseUrl = process.env.TEST_URL || "http://localhost:3000";
  let serverProcess = null;

  try {
    const isLive = await fetch(`${baseUrl}/api/canvases`).then((r) => r.status === 200).catch(() => false);
    if (isLive) {
      console.log(`Using existing active Next.js server at ${baseUrl}\n`);
    } else {
      const testPort = 3019;
      baseUrl = `http://localhost:${testPort}`;
      console.log(`Starting Next.js server on port ${testPort}...`);
      serverProcess = spawn(
        process.execPath,
        [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(testPort)],
        { stdio: "ignore" }
      );
      await waitForServer(`${baseUrl}/api/canvases`, 30000);
      console.log(`Next.js test server ready at ${baseUrl}\n`);
    }

    // =========================================================================
    // SUITE 1: SQL INJECTION RESISTANCE
    // =========================================================================
    console.log("--- Suite 1: SQL Injection Stress Testing ---");

    const sqlPayloads = [
      `'; DROP TABLE canvases; --`,
      `' OR '1'='1`,
      `admin'--`,
      `' UNION SELECT 'injected', 'hacked', '', 1, 'slug', 99, '', 0, 0--`,
      `Robert'); DROP TABLE canvas_data;--`,
      `" OR "1"="1" --`,
      `' OR 1=1 /* block comment */`,
      `\\'; DROP TABLE canvas_history; --`,
      `' AND 1=0 UNION ALL SELECT id, name, description, is_readonly, share_slug, sort_order, thumbnail, created_at, updated_at FROM canvases--`,
      `1; DELETE FROM canvases WHERE '1'='1';`,
      `' OR (SELECT COUNT(*) FROM canvases) > 0--`,
      `%'; UPDATE canvases SET is_readonly = 1 WHERE 1=1;--`,
    ];

    for (let i = 0; i < sqlPayloads.length; i++) {
      const payload = sqlPayloads[i];
      // 1.1 Injected Canvas Name in POST
      const postRes = await fetch(`${baseUrl}/api/canvases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload,
          description: `Description with SQL: ${payload}`,
          elements: [{ id: `el_${i}`, type: "rectangle", text: payload }],
        }),
      });

      assert(postRes.status === 201, `POST /api/canvases handles SQL payload in name/description (idx=${i})`);
      const postData = await postRes.json();
      assert(postData.success === true, `POST response success=true for payload ${i}`);
      const canvasId = postData.canvas.id;

      // Verify stored name is literally the payload, not executed
      const getRes = await fetch(`${baseUrl}/api/canvases/${canvasId}`);
      assert(getRes.status === 200, `GET /api/canvases/[id] retrieves canvas with SQL payload ${i}`);
      const getData = await getRes.json();
      assert(getData.canvas.name === payload.trim(), `Canvas name preserved verbatim without SQL execution (idx=${i})`);

      // 1.2 Injected Canvas ID in URL lookup
      const idInjectionRes = await fetch(`${baseUrl}/api/canvases/${encodeURIComponent(payload)}`);
      // Should return 404 because no canvas has that exact ID
      assert(idInjectionRes.status === 404, `GET with SQL injection payload in ID path returns 404 (idx=${i})`);

      // 1.3 Injected Snapshot Label in POST /history
      const historyRes = await fetch(`${baseUrl}/api/canvases/${canvasId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: payload }),
      });
      assert(historyRes.status === 201, `POST /api/canvases/[id]/history handles SQL payload in label (idx=${i})`);

      // 1.4 Injected Clone new_name
      const cloneRes = await fetch(`${baseUrl}/api/canvases/${canvasId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: payload }),
      });
      assert(cloneRes.status === 200 || cloneRes.status === 201, `POST clone handles SQL payload in new_name (idx=${i})`);
      const cloneData = await cloneRes.json();
      assert(cloneData.canvas.name === payload.trim(), `Cloned canvas name matches injection string verbatim (idx=${i})`);

      // Clean up test canvases
      await fetch(`${baseUrl}/api/canvases/${canvasId}`, { method: "DELETE" });
      await fetch(`${baseUrl}/api/canvases/${cloneData.canvas.id}`, { method: "DELETE" });
    }

    // 1.5 Verify all tables still exist and were not dropped
    const masterCheck = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const existingTables = masterCheck.rows.map((r) => r.name);
    assert(existingTables.includes("canvases"), "Table 'canvases' survives all SQL injection payloads");
    assert(existingTables.includes("canvas_data"), "Table 'canvas_data' survives all SQL injection payloads");
    assert(existingTables.includes("canvas_history"), "Table 'canvas_history' survives all SQL injection payloads");
    assert(existingTables.includes("canvas_todos"), "Table 'canvas_todos' survives all SQL injection payloads");
    assert(existingTables.includes("canvas_notes"), "Table 'canvas_notes' survives all SQL injection payloads");
    assert(existingTables.includes("canvas_extensions"), "Table 'canvas_extensions' survives all SQL injection payloads");

    // 1.6 SQL Injection in reorder array
    const reorderInjectionRes = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: [`'; DROP TABLE canvases;--`, `' OR 1=1--`] }),
    });
    assert(reorderInjectionRes.status === 200, "PUT /api/canvases/reorder handles SQL injection IDs gracefully without throwing");
    const reorderData = await reorderInjectionRes.json();
    assert(reorderData.success === true, "PUT /api/canvases/reorder returns success: true");

    // =========================================================================
    // SUITE 2: MALFORMED / TRUNCATED JSON & TYPE FUZZING
    // =========================================================================
    console.log("\n--- Suite 2: Malformed JSON Handling & Type Fuzzing ---");

    // 2.1 Malformed / Truncated JSON in POST body
    const malformedPostRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"name": "Broken JSON", "elements": [{"id": 1, "type": `, // truncated syntax
    });
    assert(malformedPostRes.status === 201, "POST /api/canvases handles truncated JSON body via catch fallback");
    const malformedPostData = await malformedPostRes.json();
    assert(malformedPostData.success === true, "POST /api/canvases with malformed JSON creates canvas with default state");
    const createdBrokenId = malformedPostData.canvas.id;

    // Clean up
    await fetch(`${baseUrl}/api/canvases/${createdBrokenId}`, { method: "DELETE" });

    // 2.2 Malformed / Truncated JSON in PUT body
    // Create valid canvas first
    const createRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "PUT Malformed Test Canvas" }),
    });
    const { canvas: validCanvas } = await createRes.json();

    const malformedPutRes = await fetch(`${baseUrl}/api/canvases/${validCanvas.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: `{"name": "Broken PUT", "elements": [`, // truncated syntax
    });
    // PUT uses `await req.json()` inside try/catch -> returns 500 JSON error rather than crashing node process
    assert(malformedPutRes.status === 500, "PUT /api/canvases/[id] with truncated JSON returns error response without crashing server");
    const malformedPutData = await malformedPutRes.json();
    assert(malformedPutData.success === false, "PUT with malformed JSON returns success: false");

    // 2.2b Non-string type in PUT name (body.name = 123)
    const nonStringPutRes = await fetch(`${baseUrl}/api/canvases/${validCanvas.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 12345 }),
    });
    // body.name.trim() throws TypeError on non-string -> caught by try/catch -> 500 error response without process crash
    assert(nonStringPutRes.status === 500, "PUT /api/canvases/[id] with non-string name returns 500 error response without crashing server");
    const nonStringPutData = await nonStringPutRes.json();
    assert(nonStringPutData.success === false, "PUT with non-string name returns success: false");

    // 2.3 Non-standard / Fuzzed types in elements, appState, files
    const fuzzedPutRes = await fetch(`${baseUrl}/api/canvases/${validCanvas.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elements: "string_instead_of_array",
        appState: 12345,
        files: null,
        todos: false,
        notes: [1, 2, 3],
        extensionsData: "not_an_object",
      }),
    });
    assert(fuzzedPutRes.status === 200, "PUT accepts fuzzed type payloads and serializes cleanly");

    // Fetch and check deserialization doesn't crash server
    const getFuzzedRes = await fetch(`${baseUrl}/api/canvases/${validCanvas.id}`);
    assert(getFuzzedRes.status === 200, "GET /api/canvases/[id] returns HTTP 200 for fuzzed types");
    const getFuzzedData = await getFuzzedRes.json();
    assert(getFuzzedData.success === true, "GET returns success: true for fuzzed types");
    assert(getFuzzedData.canvas.elements === "string_instead_of_array", "Fuzzed elements value deserialized safely");

    // 2.4 Corrupted raw JSON directly in database column
    // Insert corrupted JSON string into canvas_data
    const corruptId = `c_corrupt_${Date.now()}`;
    await db.batch(
      [
        {
          sql: `INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, 'Corrupt JSON Canvas', ?, ?)`,
          args: [corruptId, Date.now(), Date.now()],
        },
        {
          sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, updated_at)
                VALUES (?, '{invalid_json_elements', '{"theme": "light"}', '{}', '[]', '[]', '{}', ?)`,
          args: [corruptId, Date.now()],
        },
      ],
      "write"
    );

    // Call GET /api/canvases/[id]
    const getCorruptRes = await fetch(`${baseUrl}/api/canvases/${corruptId}`);
    // Because JSON.parse fails on invalid JSON, it should catch error and return 500 JSON without process termination
    assert(getCorruptRes.status === 500, "GET /api/canvases/[id] on corrupted DB JSON returns 500 error response without crashing server");
    const corruptData = await getCorruptRes.json();
    assert(corruptData.success === false, "Corrupted DB data returns success: false");

    // Server is still alive and responsive to subsequent requests
    const checkAliveRes = await fetch(`${baseUrl}/api/canvases`);
    assert(checkAliveRes.status === 200, "Next.js server remains healthy after JSON parse failure");

    // Clean up
    await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [corruptId] });
    await fetch(`${baseUrl}/api/canvases/${validCanvas.id}`, { method: "DELETE" });

    // =========================================================================
    // SUITE 3: BOUNDARY CONDITIONS & NEGATIVE TESTING
    // =========================================================================
    console.log("\n--- Suite 3: Boundary Conditions & Negative Testing ---");

    const nonExistentId = "non_existent_canvas_xyz_999999999";

    // 3.1 Non-existent IDs return 404
    const get404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}`);
    assert(get404.status === 404, "GET non-existent canvas ID returns 404");

    const put404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should Fail" }),
    });
    assert(put404.status === 404, "PUT non-existent canvas ID returns 404");

    const del404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}`, {
      method: "DELETE",
    });
    assert(del404.status === 404, "DELETE non-existent canvas ID returns 404");

    const clone404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: "Clone Fail" }),
    });
    assert(clone404.status === 404, "POST clone non-existent canvas ID returns 404");

    const histGet404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}/history`);
    assert(histGet404.status === 404, "GET history non-existent canvas ID returns 404");

    const histPost404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Snap Fail" }),
    });
    assert(histPost404.status === 404, "POST history non-existent canvas ID returns 404");

    const restore404 = await fetch(
      `${baseUrl}/api/canvases/${nonExistentId}/history/snap_xyz/restore`,
      { method: "POST" }
    );
    assert(restore404.status === 404, "POST restore non-existent canvas ID returns 404");

    const share404 = await fetch(`${baseUrl}/api/canvases/${nonExistentId}/share`);
    assert(share404.status === 404, "GET share non-existent canvas ID returns 404");

    // 3.2 Invalid Snapshot ID on existing canvas
    const createBRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Boundary Canvas A" }),
    });
    const { canvas: canvasA } = await createBRes.json();

    const badSnapRestore = await fetch(
      `${baseUrl}/api/canvases/${canvasA.id}/history/non_existent_snapshot_id_999/restore`,
      { method: "POST" }
    );
    assert(badSnapRestore.status === 404, "POST restore non-existent snapshot ID returns 404");

    // 3.3 Cross-canvas snapshot isolation: snapshot of Canvas A cannot be restored on Canvas B
    const createCRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Boundary Canvas B" }),
    });
    const { canvas: canvasB } = await createCRes.json();

    // Create a snapshot on Canvas A
    const snapARes = await fetch(`${baseUrl}/api/canvases/${canvasA.id}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Snapshot for A only" }),
    });
    const { snapshot_id: snapAId } = await snapARes.json();

    // Attempt to restore Canvas A's snapshot on Canvas B
    const crossRestoreRes = await fetch(
      `${baseUrl}/api/canvases/${canvasB.id}/history/${snapAId}/restore`,
      { method: "POST" }
    );
    assert(crossRestoreRes.status === 404, "Cross-canvas snapshot restore returns 404 (strict isolation)");

    // 3.4 Negative sort orders and sorting boundary
    const negSortRes = await fetch(`${baseUrl}/api/canvases/${canvasA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: -500 }),
    });
    assert(negSortRes.status === 200, "PUT canvas accepts negative sort_order (-500)");

    const posSortRes = await fetch(`${baseUrl}/api/canvases/${canvasB.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: 500 }),
    });
    assert(posSortRes.status === 200, "PUT canvas accepts positive sort_order (+500)");

    // Verify ordering in GET /api/canvases
    const orderListRes = await fetch(`${baseUrl}/api/canvases`);
    const orderListData = await orderListRes.json();
    const idxA = orderListData.canvases.findIndex((c) => c.id === canvasA.id);
    const idxB = orderListData.canvases.findIndex((c) => c.id === canvasB.id);
    assert(idxA < idxB, "Canvas with sort_order=-500 precedes canvas with sort_order=+500");

    // 3.5 Reorder API edge cases
    const badReorderRes1 = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: "not_an_array" }),
    });
    assert(badReorderRes1.status === 400, "PUT /api/canvases/reorder with string order returns 400");

    const badReorderRes2 = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: null }),
    });
    assert(badReorderRes2.status === 400, "PUT /api/canvases/reorder with null order returns 400");

    const emptyReorderRes = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: [] }),
    });
    assert(emptyReorderRes.status === 200, "PUT /api/canvases/reorder with empty array returns 200");

    // 3.6 Duplicate share_slug handling
    const dupSlugRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Duplicate Slug Canvas", share_slug: canvasA.share_slug }),
    });
    // Triggers UNIQUE constraint on canvases.share_slug -> 500 error response without crashing server
    assert(dupSlugRes.status === 500, "POST /api/canvases with duplicate share_slug returns 500 error response");
    const dupSlugData = await dupSlugRes.json();
    assert(dupSlugData.success === false, "Duplicate share_slug returns success: false");

    // Clean up boundary test canvases
    await fetch(`${baseUrl}/api/canvases/${canvasA.id}`, { method: "DELETE" });
    await fetch(`${baseUrl}/api/canvases/${canvasB.id}`, { method: "DELETE" });

    // =========================================================================
    // SUITE 4: CASCADE DELETION VERIFICATION UNDER MULTI-RECORD STRESS
    // =========================================================================
    console.log("\n--- Suite 4: Cascade Deletion Verification Under Multi-Record Stress ---");

    const stressCanvases = [];
    const numCanvases = 3;

    for (let c = 0; c < numCanvases; c++) {
      const now = Date.now() + c;
      const cId = `c_cascade_stress_${c}_${now}`;
      stressCanvases.push(cId);

      // Populate parent
      await db.execute({
        sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, created_at, updated_at)
              VALUES (?, ?, 'Stress cascade test', 0, ?, ?, ?, ?)`,
        args: [cId, `Stress Canvas ${c}`, cId, c, now, now],
      });

      // Populate canvas_data
      await db.execute({
        sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
              VALUES (?, '[]', '{}', '{}', '[]', '[]', '{}', 1, ?)`,
        args: [cId, now],
      });

      // Populate multiple canvas_history records (5 per canvas)
      for (let h = 0; h < 5; h++) {
        await db.execute({
          sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
                VALUES (?, ?, ?, '[]', '{}', '{}', '[]', '[]', '{}', 0, ?)`,
          args: [`snap_${cId}_${h}`, cId, `Checkpoint ${h}`, now + h],
        });
      }

      // Populate multiple canvas_todos records (5 per canvas)
      for (let t = 0; t < 5; t++) {
        await db.execute({
          sql: `INSERT INTO canvas_todos (id, canvas_id, text, status, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, 'todo', ?, ?, ?)`,
          args: [`todo_${cId}_${t}`, cId, `Task ${t} for canvas ${c}`, t, now, now],
        });
      }

      // Populate multiple canvas_notes records (4 per canvas)
      for (let n = 0; n < 4; n++) {
        await db.execute({
          sql: `INSERT INTO canvas_notes (id, canvas_id, duration_sec, mime_type, audio_data, created_at)
                VALUES (?, ?, ?, 'audio/webm', 'data:audio/webm;base64,mockdata', ?)`,
          args: [`note_${cId}_${n}`, cId, 10.0 + n, now + n],
        });
      }

      // Populate multiple canvas_extensions records (3 per canvas)
      for (let e = 0; e < 3; e++) {
        await db.execute({
          sql: `INSERT INTO canvas_extensions (canvas_id, extension_id, state_json, updated_at)
                VALUES (?, ?, '{"active": true}', ?)`,
          args: [cId, `ext_${c}_${e}`, now],
        });
      }
    }

    // Verify all records exist across all child tables before cascade deletion
    for (const cId of stressCanvases) {
      const dCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_data WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const hCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_history WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const tCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_todos WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const nCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_notes WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const eCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_extensions WHERE canvas_id = ?", args: [cId] })).rows[0].c;

      assert(dCount === 1, `canvas_data row populated before delete (id=${cId})`);
      assert(hCount === 5, `canvas_history rows populated before delete (5 rows, id=${cId})`);
      assert(tCount === 5, `canvas_todos rows populated before delete (5 rows, id=${cId})`);
      assert(nCount === 4, `canvas_notes rows populated before delete (4 rows, id=${cId})`);
      assert(eCount === 3, `canvas_extensions rows populated before delete (3 rows, id=${cId})`);
    }

    // Now delete each canvas via the live HTTP API endpoint DELETE /api/canvases/[id]
    for (let c = 0; c < stressCanvases.length; c++) {
      const cId = stressCanvases[c];
      const delRes = await fetch(`${baseUrl}/api/canvases/${cId}`, { method: "DELETE" });
      assert(delRes.status === 200, `DELETE /api/canvases/${cId} returns 200`);
      const delData = await delRes.json();
      assert(delData.deleted_id === cId, `DELETE returned matching deleted_id for ${cId}`);

      // Verify ZERO orphaned records remain in ANY child table
      const dCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_data WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const hCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_history WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const tCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_todos WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const nCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_notes WHERE canvas_id = ?", args: [cId] })).rows[0].c;
      const eCount = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_extensions WHERE canvas_id = ?", args: [cId] })).rows[0].c;

      assert(dCount === 0, `Zero orphaned records in canvas_data after cascade delete for ${cId}`);
      assert(hCount === 0, `Zero orphaned records in canvas_history after cascade delete for ${cId}`);
      assert(tCount === 0, `Zero orphaned records in canvas_todos after cascade delete for ${cId}`);
      assert(nCount === 0, `Zero orphaned records in canvas_notes after cascade delete for ${cId}`);
      assert(eCount === 0, `Zero orphaned records in canvas_extensions after cascade delete for ${cId}`);
    }

    // Verify parent table has 0 rows for these test IDs
    const parentCheck = await db.execute({
      sql: `SELECT COUNT(*) as c FROM canvases WHERE id IN (?, ?, ?)`,
      args: stressCanvases,
    });
    assert(parentCheck.rows[0].c === 0, "All stress test canvases cleanly removed from parent canvases table");

    // =========================================================================
    // SUITE 5: HIGH LOAD, LARGE PAYLOADS & UNICODE BOUNDARIES
    // =========================================================================
    console.log("\n--- Suite 5: High Load, Large Payloads & Unicode Boundaries ---");

    // 5.1 Large payload with 500 elements and deep metadata
    const largeElements = Array.from({ length: 500 }, (_, i) => ({
      id: `element_heavy_${i}`,
      type: i % 2 === 0 ? "rectangle" : "arrow",
      x: i * 10,
      y: i * 15,
      width: 120,
      height: 60,
      strokeColor: "#ff0000",
      backgroundColor: "#ffff00",
      customData: { index: i, text: `Heavy item ${i} with long descriptive string` },
    }));

    const unicodeTitle = "🎨 教师画板 — Algoritmos & Estruturas de Dados / 算法与数据结构 🚀 (Special Chars: <>&\"'\\/!@#$%^&*()-=_+[]{}|;:,.<>?)";

    const largePostRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: unicodeTitle,
        elements: largeElements,
        appState: { viewBackgroundColor: "#000000", zoom: { value: 1.5 } },
        files: {
          asset_1: { id: "asset_1", dataURL: "data:image/svg+xml;base64," + "A".repeat(5000) },
        },
      }),
    });

    assert(largePostRes.status === 201, "POST large payload (500 elements + large base64 file + unicode title) succeeds");
    const largeData = await largePostRes.json();
    const largeCanvasId = largeData.canvas.id;

    // Load back and assert element count and unicode title fidelity
    const loadLargeRes = await fetch(`${baseUrl}/api/canvases/${largeCanvasId}`);
    assert(loadLargeRes.status === 200, "GET large canvas returns HTTP 200");
    const loadLargeData = await loadLargeRes.json();
    assert(loadLargeData.canvas.elements.length === 500, "Retrieved large canvas contains exactly 500 elements");
    assert(
      loadLargeData.canvas.name === unicodeTitle.trim(),
      "Unicode and special characters in name preserved perfectly",
      `expected: ${JSON.stringify(unicodeTitle.trim())}, got: ${JSON.stringify(loadLargeData.canvas.name)}`
    );
    assert(loadLargeData.canvas.files.asset_1.dataURL.length > 5000, "Large file dataURL preserved without truncation");

    // Clean up large canvas
    await fetch(`${baseUrl}/api/canvases/${largeCanvasId}`, { method: "DELETE" });
    const verifyCleanRes = await fetch(`${baseUrl}/api/canvases/${largeCanvasId}`);
    assert(verifyCleanRes.status === 404, "Large canvas cleanly deleted and returns 404");

    // 5.2 Null-byte handling in string fields
    const nullByteRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "PrefixBeforeNull\0SuffixAfterNull",
      }),
    });
    assert(nullByteRes.status === 201, "POST canvas with embedded null-byte succeeds without error");
    const nullByteData = await nullByteRes.json();
    const nullByteGet = await fetch(`${baseUrl}/api/canvases/${nullByteData.canvas.id}`);
    const nullByteGetData = await nullByteGet.json();
    // SQLite C engine treats \0 as C-string terminator for TEXT columns
    assert(
      nullByteGetData.canvas.name === "PrefixBeforeNull",
      "SQLite engine safely truncates at null byte without crashing or corrupting DB"
    );
    await fetch(`${baseUrl}/api/canvases/${nullByteData.canvas.id}`, { method: "DELETE" });

  } finally {
    if (serverProcess) {
      console.log("\nStopping Next.js test server...");
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
  console.log(` Adversarial Stress Verification Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("===============================================================================");

  if (failedCount > 0) {
    console.error("\nFailures encountered:");
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
}

runAdversarialStress().catch((err) => {
  console.error("Fatal error during adversarial stress testing:", err);
  process.exit(1);
});
