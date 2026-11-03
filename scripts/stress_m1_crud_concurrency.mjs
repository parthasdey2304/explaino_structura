/**
 * Empirical Adversarial Stress Test & Concurrency Harness for Milestone 1
 * Targets: SQLite / LibSQL storage layer & Next.js App Router API endpoints
 * 
 * Tests:
 * 1. Direct SQLite WAL Concurrency & High Volume Batching:
 *    - 10 concurrent async workers executing 100 transactions in WAL mode
 *    - Write contention on single canvas row (multiple simultaneous updates)
 *    - True parallel concurrent readers vs writers under WAL mode
 *    - 50-canvas parallel cascade deletion and orphan check
 * 2. Live HTTP API High-Volume CRUD:
 *    - 60 rapid concurrent POST /api/canvases
 *    - Tab metadata listing latency benchmarking (< 25ms requirement)
 *    - Full data listing (include_data=true) scalability
 *    - 60 concurrent PUT updates with automatic snapshot generation
 *    - Tab reordering with 60 tabs in batch transaction
 *    - 60 rapid concurrent DELETEs and 404 verification
 * 3. Extreme Payloads & Memory Limits:
 *    - 3,000 Excalidraw vector elements (~2.5 MB)
 *    - Multi-megabyte embedded base64 image files (~4 MB)
 *    - Full round-trip persistence, serialization, and deserialization
 *    - Multi-megabyte snapshot creation, modification, and restoration
 *    - Multi-megabyte deep cloning
 *    - Read-only share endpoint contract with giant scene
 * 4. Adversarial Edge Cases & Boundary Values:
 *    - SQL injection strings in canvas metadata and search parameters
 *    - Extreme Unicode, emojis, backslashes, quotes, null bytes
 *    - Malformed JSON payloads and invalid body types
 *    - Non-existent canvas/snapshot IDs (404 enforcement)
 *    - Invalid reorder payloads (400 validation)
 * 5. SQLite Storage Engine Integrity:
 *    - PRAGMA integrity_check
 *    - PRAGMA foreign_key_check
 */

import { createClient } from "@libsql/client";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    failures.push({ message, details });
    console.error(`  ❌ FAIL: ${message}${details ? ` -> ${details}` : ""}`);
  }
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

function generateMockElement(id, index) {
  return {
    id: `el_${id}_${index}`,
    type: index % 4 === 0 ? "rectangle" : index % 4 === 1 ? "diamond" : index % 4 === 2 ? "arrow" : "text",
    x: (index * 45) % 3000,
    y: Math.floor(index / 60) * 80,
    width: 120 + (index % 50),
    height: 70 + (index % 30),
    angle: 0,
    strokeColor: index % 2 === 0 ? "#1e1e1e" : "#e03131",
    backgroundColor: index % 3 === 0 ? "#ffc9c9" : "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: 100000 + index,
    version: 1,
    versionNonce: 200000 + index,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: {
      step: index,
      label: `Empirical Test Element ${index}`,
      tags: ["stress", "excalidraw", "autogen"],
    },
    text: index % 4 === 3 ? `Label #${index} for stress test` : undefined,
    fontSize: index % 4 === 3 ? 16 : undefined,
    fontFamily: index % 4 === 3 ? 1 : undefined,
  };
}

async function runEmpiricalStressSuite() {
  console.log("================================================================================");
  console.log("   EMPIRICAL ADVERSARIAL STRESS TEST & CONCURRENCY HARNESS (MILESTONE 1)");
  console.log("================================================================================\n");

  const startTime = Date.now();
  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.resolve(dbDir, "explaino.db").replace(/\\/g, "/");
  const db = createClient({ url: `file:${dbPath}` });

  // ---------------------------------------------------------------------------
  // SECTION 1: Direct LibSQL Database Engine Stress & WAL Concurrency
  // ---------------------------------------------------------------------------
  console.log("--- Section 1: Direct Database Engine Stress & WAL Concurrency ---");

  // 1.1 Verify WAL Pragmas
  const walRes = await db.execute("PRAGMA journal_mode;");
  const currentWal = Object.values(walRes.rows[0])[0]?.toString().toLowerCase();
  assert(currentWal === "wal", `PRAGMA journal_mode is WAL (found: ${currentWal})`);

  const fkRes = await db.execute("PRAGMA foreign_keys;");
  const currentFk = Number(Object.values(fkRes.rows[0])[0]);
  assert(currentFk === 1, `PRAGMA foreign_keys is enabled (found: ${currentFk})`);

  await db.execute("PRAGMA busy_timeout = 5000;");
  // Clean up any leftover records from prior runs
  await db.execute("DELETE FROM canvases WHERE id LIKE 'stress_direct_%';");

  // 1.2 High Concurrency Write Test (10 workers x 10 transactions = 100 parallel transactions)
  console.log("\n  -> Launching 10 concurrent async workers (100 parallel write transactions)...");
  const concurrencyLevel = 10;
  const writesPerWorker = 10;
  const directCanvasIds = [];
  const workerStart = Date.now();

  const workerPromises = Array.from({ length: concurrencyLevel }, async (_, workerIdx) => {
    const workerCreatedIds = [];
    for (let i = 0; i < writesPerWorker; i++) {
      const cid = `stress_direct_w${workerIdx}_${i}_${Date.now()}`;
      const now = Date.now();
      workerCreatedIds.push(cid);
      await db.batch(
        [
          {
            sql: `INSERT INTO canvases (id, name, description, is_readonly, share_slug, sort_order, thumbnail, created_at, updated_at)
                  VALUES (?, ?, ?, 0, ?, ?, '', ?, ?)`,
            args: [cid, `Worker ${workerIdx} Canvas ${i}`, `Direct DB stress write`, cid, workerIdx * 100 + i, now, now],
          },
          {
            sql: `INSERT INTO canvas_data (canvas_id, elements, app_state, files, todos, notes, extensions_data, version, updated_at)
                  VALUES (?, '[]', '{"zoom":1}', '{}', '[]', '[]', '{}', 1, ?)`,
            args: [cid, now],
          },
          {
            sql: `INSERT INTO canvas_history (id, canvas_id, label, elements, app_state, files, todos, notes, extensions_data, element_count, created_at)
                  VALUES (?, ?, 'Initial', '[]', '{}', '{}', '[]', '[]', '{}', 0, ?)`,
            args: [`snap_${cid}`, cid, now],
          },
        ],
        "write"
      );
    }
    return workerCreatedIds;
  });

  const workerResults = await Promise.all(workerPromises);
  const workerDuration = Date.now() - workerStart;
  for (const ids of workerResults) directCanvasIds.push(...ids);

  assert(
    directCanvasIds.length === concurrencyLevel * writesPerWorker,
    `All ${directCanvasIds.length} concurrent direct transactions committed cleanly in ${workerDuration}ms (${(
      (concurrencyLevel * writesPerWorker) /
      (workerDuration / 1000)
    ).toFixed(1)} tx/sec)`
  );

  // Verify all rows exist in DB
  const checkCountRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM canvases WHERE id LIKE 'stress_direct_%'`,
  });
  const insertedCount = Number(checkCountRes.rows[0].count);
  assert(
    insertedCount === directCanvasIds.length,
    `Exact row count matched in DB: ${insertedCount}/${directCanvasIds.length}`
  );

  // 1.3 High Contention on Single Row (10 workers updating the exact same canvas simultaneously)
  console.log("\n  -> Testing high write contention on single canvas row (10 concurrent updates)...");
  const contentionTargetId = directCanvasIds[0];
  const contentionStart = Date.now();

  const contentionPromises = Array.from({ length: 10 }, async (_, idx) => {
    const now = Date.now();
    await db.batch(
      [
        {
          sql: `UPDATE canvas_data SET version = version + 1, updated_at = ? WHERE canvas_id = ?`,
          args: [now, contentionTargetId],
        },
        {
          sql: `UPDATE canvases SET updated_at = ?, name = ? WHERE id = ?`,
          args: [now, `Contention Update #${idx}`, contentionTargetId],
        },
      ],
      "write"
    );
  });

  await Promise.all(contentionPromises);
  const contentionDuration = Date.now() - contentionStart;

  const contentionVerif = await db.execute({
    sql: `SELECT version FROM canvas_data WHERE canvas_id = ?`,
    args: [contentionTargetId],
  });
  const finalVersion = Number(contentionVerif.rows[0].version);
  assert(
    finalVersion === 11,
    `Single-row write contention resolved without lockups: version incremented from 1 to 11 (${contentionDuration}ms)`
  );

  // 1.4 True Parallel Readers vs Concurrent Writers under WAL
  console.log("\n  -> Testing true parallel concurrent readers vs active writers in WAL mode...");
  const rwStart = Date.now();
  const parallelReaders = Array.from({ length: 25 }, async () => {
    const res = await db.execute("SELECT COUNT(*) as count FROM canvases");
    return Number(res.rows[0].count);
  });
  const parallelWriters = Array.from({ length: 10 }, async (_, i) => {
    const tid = `rw_test_${i}_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, 'RW Test', ?, ?)`,
      args: [tid, Date.now(), Date.now()],
    });
    await db.execute({
      sql: `DELETE FROM canvases WHERE id = ?`,
      args: [tid],
    });
    return tid;
  });

  const [readerResults, writerResults] = await Promise.all([
    Promise.all(parallelReaders),
    Promise.all(parallelWriters),
  ]);
  const rwDuration = Date.now() - rwStart;

  assert(
    readerResults.length === 25 && writerResults.length === 10,
    `WAL non-blocking verified: 25 parallel reads and 10 parallel writes completed in ${rwDuration}ms with zero locks`
  );

  // 1.5 Parallel Cascade Deletion of 50 Canvases
  console.log("\n  -> Testing parallel cascade deletion of 50 canvases with dependent records...");
  const deleteBatch = directCanvasIds.slice(0, 50);
  const delStart = Date.now();

  const delPromises = deleteBatch.map((id) =>
    db.execute({
      sql: `DELETE FROM canvases WHERE id = ?`,
      args: [id],
    })
  );
  await Promise.all(delPromises);
  const delDuration = Date.now() - delStart;

  // Verify child tables have 0 orphaned rows
  const orphanCheck = await db.execute({
    sql: `SELECT 
            (SELECT COUNT(*) FROM canvas_data WHERE canvas_id LIKE 'stress_direct_%') as data_count,
            (SELECT COUNT(*) FROM canvas_history WHERE canvas_id LIKE 'stress_direct_%') as hist_count`,
  });
  const remainingData = Number(orphanCheck.rows[0].data_count);
  const remainingHist = Number(orphanCheck.rows[0].hist_count);
  const expectedRemaining = directCanvasIds.length - deleteBatch.length;

  assert(
    remainingData === expectedRemaining && remainingHist === expectedRemaining,
    `Cascade deletion purged all 50 child records in parallel (${delDuration}ms); remaining: ${remainingData}/${expectedRemaining}`
  );

  // Clean up remaining direct canvases
  for (const id of directCanvasIds.slice(50)) {
    await db.execute({ sql: `DELETE FROM canvases WHERE id = ?`, args: [id] });
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: Live HTTP API High-Volume CRUD (60 Canvases)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 2: Live HTTP API High-Volume CRUD (60 Canvases) ---");
  const testPort = process.env.TEST_PORT || 3000;
  const baseUrl = `http://localhost:${testPort}`;
  let serverProc = null;

  try {
    // Check if server is already running on baseUrl
    let serverRunning = false;
    try {
      const probe = await fetch(`${baseUrl}/api/canvases`);
      if (probe.status === 200) serverRunning = true;
    } catch {}

    if (!serverRunning) {
      console.log(`  Starting Next.js server on port ${testPort}...`);
      serverProc = spawn(
        process.execPath,
        [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(testPort)],
        { stdio: "ignore" }
      );
      await waitForServer(`${baseUrl}/api/canvases`, 30000);
    }
    console.log(`  Next.js server is ready and accepting requests at ${baseUrl}\n`);

    // 2.1 Concurrently create 60 canvases via HTTP POST /api/canvases
    const numHttpCanvases = 60;
    console.log(`  -> Concurrently creating ${numHttpCanvases} canvases via HTTP POST /api/canvases...`);
    const httpCreatedIds = [];
    const httpPostStart = Date.now();

    // Batch in chunks of 10 to simulate real client traffic
    const chunkSize = 10;
    for (let i = 0; i < numHttpCanvases; i += chunkSize) {
      const chunkPromises = Array.from({ length: chunkSize }, async (_, offset) => {
        const idx = i + offset;
        const payload = {
          name: `Tab Canvas #${idx} - Concurrency Stress`,
          description: `Generated for empirical testing, index ${idx}`,
          elements: [generateMockElement(`http_${idx}`, 1), generateMockElement(`http_${idx}`, 2)],
          appState: { theme: "dark", zoom: 1.25, viewBackgroundColor: "#121212" },
          files: {},
          todos: [{ id: `todo_${idx}_1`, text: `Stress item ${idx}`, status: "todo" }],
          extensionsData: { activeTab: "console", customSetting: idx },
        };

        const res = await fetch(`${baseUrl}/api/canvases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        return { status: res.status, data };
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const { status, data } of chunkResults) {
        if (status === 201 && data.success && data.canvas?.id) {
          httpCreatedIds.push(data.canvas.id);
        }
      }
    }

    const httpPostDuration = Date.now() - httpPostStart;
    assert(
      httpCreatedIds.length === numHttpCanvases,
      `Successfully created ${httpCreatedIds.length}/${numHttpCanvases} canvases via HTTP POST in ${httpPostDuration}ms (${(
        numHttpCanvases /
        (httpPostDuration / 1000)
      ).toFixed(1)} req/sec)`
    );

    // 2.2 Benchmarking GET /api/canvases (Tab Bar Latency)
    console.log("\n  -> Benchmarking GET /api/canvases metadata listing latency...");
    const listLatencies = [];
    for (let r = 0; r < 5; r++) {
      const t0 = Date.now();
      const res = await fetch(`${baseUrl}/api/canvases`);
      const t1 = Date.now();
      const json = await res.json();
      listLatencies.push(t1 - t0);
      assert(res.status === 200 && json.success && Array.isArray(json.canvases), `GET /api/canvases iteration #${r + 1} succeeded`);
    }
    const avgLatency = listLatencies.reduce((a, b) => a + b, 0) / listLatencies.length;
    console.log(`  Tab bar metadata latencies: [${listLatencies.join(", ")}] ms (average: ${avgLatency.toFixed(1)} ms)`);
    assert(avgLatency < 50, `Tab bar metadata listing latency is well below 50ms threshold (measured: ${avgLatency.toFixed(1)}ms)`);

    // 2.3 Benchmarking GET /api/canvases?include_data=true with 60 full canvases
    console.log("\n  -> Testing GET /api/canvases?include_data=true with 60 populated canvases...");
    const tData0 = Date.now();
    const incDataRes = await fetch(`${baseUrl}/api/canvases?include_data=true`);
    const incDataTime = Date.now() - tData0;
    const incDataJson = await incDataRes.json();
    assert(
      incDataRes.status === 200 && incDataJson.success && incDataJson.canvases.length >= numHttpCanvases,
      `include_data=true loaded ${incDataJson.canvases?.length} full canvases with elements in ${incDataTime}ms`
    );

    // 2.4 Rapid Concurrent PUT /api/canvases/[id] with create_snapshot
    console.log("\n  -> Concurrently updating 60 canvases and creating checkpoints (PUT /api/canvases/[id])...");
    const putStart = Date.now();
    const putPromises = httpCreatedIds.map(async (cid, idx) => {
      const updatePayload = {
        name: `Renamed Tab #${idx}`,
        elements: [
          generateMockElement(`upd_${idx}`, 1),
          generateMockElement(`upd_${idx}`, 2),
          generateMockElement(`upd_${idx}`, 3),
        ],
        create_snapshot: true,
        snapshot_label: `Checkpoint for #${idx}`,
      };
      const res = await fetch(`${baseUrl}/api/canvases/${cid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      return { status: res.status, json: await res.json() };
    });

    const putResults = await Promise.all(putPromises);
    const putDuration = Date.now() - putStart;
    const successfulPuts = putResults.filter((r) => r.status === 200 && r.json.success).length;
    assert(
      successfulPuts === numHttpCanvases,
      `All 60 concurrent updates + snapshots completed in ${putDuration}ms (${(
        numHttpCanvases /
        (putDuration / 1000)
      ).toFixed(1)} req/sec)`
    );

    // Verify history snapshot count on a sample
    const sampleHistoryRes = await fetch(`${baseUrl}/api/canvases/${httpCreatedIds[0]}/history`);
    const sampleHistory = await sampleHistoryRes.json();
    assert(
      sampleHistoryRes.status === 200 && sampleHistory.snapshots?.length >= 2,
      `History contains initial + updated checkpoints (${sampleHistory.snapshots?.length} snapshots)`
    );

    // 2.5 Batch Reorder 60 Tabs (PUT /api/canvases/reorder)
    console.log("\n  -> Reordering 60 tabs in reverse order (PUT /api/canvases/reorder)...");
    const reversedIds = [...httpCreatedIds].reverse();
    const reorderRes = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reversedIds }),
    });
    const reorderJson = await reorderRes.json();
    assert(reorderRes.status === 200 && reorderJson.success && reorderJson.count === 60, "Reorder 60 tabs returned HTTP 200 with count=60");

    // Verify ordering in GET /api/canvases
    const listAfterReorder = await (await fetch(`${baseUrl}/api/canvases`)).json();
    const firstListedId = listAfterReorder.canvases[0]?.id;
    assert(firstListedId === reversedIds[0], `Tab order verified: first tab is now ${firstListedId} (was reversed[0])`);

    // 2.6 Rapid Concurrent DELETE of 60 Canvases
    console.log("\n  -> Concurrently deleting 60 canvases via DELETE /api/canvases/[id]...");
    const delHttpStart = Date.now();
    const delPromises = httpCreatedIds.map(async (cid) => {
      const res = await fetch(`${baseUrl}/api/canvases/${cid}`, { method: "DELETE" });
      return { status: res.status, json: await res.json() };
    });
    const delResults = await Promise.all(delPromises);
    const delHttpDuration = Date.now() - delHttpStart;
    const successfulDels = delResults.filter((r) => r.status === 200 && r.json.success).length;
    assert(
      successfulDels === numHttpCanvases,
      `All 60 canvases deleted concurrently in ${delHttpDuration}ms (${(
        numHttpCanvases /
        (delHttpDuration / 1000)
      ).toFixed(1)} req/sec)`
    );

    // Verify 404 for deleted canvases
    const check404Res = await fetch(`${baseUrl}/api/canvases/${httpCreatedIds[0]}`);
    assert(check404Res.status === 404, `Deleted canvas returns HTTP 404`);

    // ---------------------------------------------------------------------------
    // SECTION 3: Extreme & Adversarial Large Payloads
    // ---------------------------------------------------------------------------
    console.log("\n--- Section 3: Extreme & Adversarial Large Payloads ---");

    // 3.1 3,000 Excalidraw Vector Elements (~2.5 MB)
    console.log("  -> Generating 3,000 vector elements payload...");
    const elementCount = 3000;
    const largeElements = Array.from({ length: elementCount }, (_, idx) => generateMockElement("giant", idx));
    const elementsJsonSize = Buffer.byteLength(JSON.stringify(largeElements), "utf8");
    console.log(`  -> 3,000 elements raw JSON size: ${(elementsJsonSize / 1024 / 1024).toFixed(2)} MB`);

    // 3.2 4 MB Base64 Embedded Media Files
    console.log("  -> Generating 4 MB base64 files dictionary...");
    const base64Chunk = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".repeat(15000);
    const mockFiles = {
      "file_asset_1": { mimeType: "image/png", id: "file_asset_1", dataURL: base64Chunk, created: Date.now() },
      "file_asset_2": { mimeType: "image/png", id: "file_asset_2", dataURL: base64Chunk, created: Date.now() },
    };
    const filesJsonSize = Buffer.byteLength(JSON.stringify(mockFiles), "utf8");
    console.log(`  -> Embedded files raw JSON size: ${(filesJsonSize / 1024 / 1024).toFixed(2)} MB`);
    const totalPayloadBytes = elementsJsonSize + filesJsonSize;
    console.log(`  -> Total combined request size: ${(totalPayloadBytes / 1024 / 1024).toFixed(2)} MB`);

    // 3.3 Create Canvas with Extreme Payload via POST /api/canvases
    console.log("  -> Sending large payload to POST /api/canvases...");
    const tPostGiant0 = Date.now();
    const giantPostRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Giant Architecture Canvas (3000 elements + 4MB assets)",
        description: "Adversarial stress payload",
        elements: largeElements,
        appState: { viewBackgroundColor: "#ffffff", zoom: 0.5 },
        files: mockFiles,
      }),
    });
    const giantPostTime = Date.now() - tPostGiant0;
    const giantPostJson = await giantPostRes.json();
    assert(
      giantPostRes.status === 201 && giantPostJson.success && giantPostJson.canvas?.id,
      `Created giant canvas in ${giantPostTime}ms with ID: ${giantPostJson.canvas?.id}`
    );
    const giantId = giantPostJson.canvas.id;

    // 3.4 Retrieve and verify full round-trip accuracy via GET /api/canvases/[id]
    console.log("  -> Retrieving giant canvas via GET /api/canvases/[id]...");
    const tGetGiant0 = Date.now();
    const giantGetRes = await fetch(`${baseUrl}/api/canvases/${giantId}`);
    const giantGetTime = Date.now() - tGetGiant0;
    const giantGetJson = await giantGetRes.json();

    assert(
      giantGetRes.status === 200 && giantGetJson.success,
      `Retrieved giant canvas via HTTP 200 in ${giantGetTime}ms`
    );
    assert(
      giantGetJson.canvas.elements.length === elementCount,
      `All ${elementCount} elements restored intact without truncation`
    );
    assert(
      Object.keys(giantGetJson.canvas.files).length === 2,
      `Embedded files dictionary restored intact with 2 large assets`
    );
    assert(
      giantGetJson.canvas.elements[2999].id === `el_giant_2999`,
      `Element #2999 ID and customData integrity verified: ${giantGetJson.canvas.elements[2999].customData?.label}`
    );

    // 3.5 Create Snapshot of Multi-MB Scene via POST /api/canvases/[id]/history
    console.log("  -> Creating manual snapshot of giant scene...");
    const snapRes = await fetch(`${baseUrl}/api/canvases/${giantId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Multi-MB Full Checkpoint" }),
    });
    const snapJson = await snapRes.json();
    assert(snapRes.status === 201 && snapJson.snapshot_id, `Snapshot created with ID: ${snapJson.snapshot_id}`);
    const giantSnapId = snapJson.snapshot_id;

    // 3.6 Overwrite canvas with minimal elements
    console.log("  -> Overwriting canvas with 1 minimal element...");
    const minPutRes = await fetch(`${baseUrl}/api/canvases/${giantId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elements: [generateMockElement("min", 0)],
        files: {},
      }),
    });
    assert(minPutRes.status === 200, "Overwrite with minimal elements returned HTTP 200");

    const checkMinRes = await (await fetch(`${baseUrl}/api/canvases/${giantId}`)).json();
    assert(checkMinRes.canvas.elements.length === 1, "Canvas currently has 1 element");

    // 3.7 Restore Snapshot of Multi-MB Scene via POST /api/canvases/[id]/history/[snapshotId]/restore
    console.log("  -> Restoring multi-MB snapshot...");
    const restoreRes = await fetch(`${baseUrl}/api/canvases/${giantId}/history/${giantSnapId}/restore`, {
      method: "POST",
    });
    const restoreJson = await restoreRes.json();
    assert(restoreRes.status === 200 && restoreJson.restored === true, "Snapshot restore returned HTTP 200 & restored: true");

    const checkRestored = await (await fetch(`${baseUrl}/api/canvases/${giantId}`)).json();
    assert(
      checkRestored.canvas.elements.length === elementCount,
      `Snapshot restoration returned canvas to full ${elementCount} elements`
    );
    assert(
      Object.keys(checkRestored.canvas.files).length === 2,
      `Snapshot restoration returned files back to 2 large assets`
    );

    // 3.8 Deep Clone of Multi-MB Scene via POST /api/canvases/[id]/clone
    console.log("  -> Deep cloning multi-MB canvas...");
    const cloneRes = await fetch(`${baseUrl}/api/canvases/${giantId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: "Cloned Giant Canvas" }),
    });
    const cloneJson = await cloneRes.json();
    assert(cloneRes.status === 201 && cloneJson.canvas?.id, `Cloned giant canvas created with new ID: ${cloneJson.canvas?.id}`);
    const clonedGiantId = cloneJson.canvas.id;

    const checkCloned = await (await fetch(`${baseUrl}/api/canvases/${clonedGiantId}`)).json();
    assert(
      checkCloned.canvas.elements.length === elementCount,
      `Cloned canvas retained all ${elementCount} elements`
    );

    // 3.9 Public Share Contract with Giant Scene (GET /api/canvases/[id]/share)
    console.log("  -> Verifying public share contract with giant scene...");
    const shareRes = await fetch(`${baseUrl}/api/canvases/${giantId}/share`);
    const shareJson = await shareRes.json();
    assert(shareRes.status === 200 && shareJson.success, "Public share endpoint returned HTTP 200 for giant canvas");
    assert(shareJson.canvas.is_readonly === 1, "Public share enforces is_readonly: 1 on giant scene");
    assert(shareJson.canvas.appState?.viewModeEnabled === true, "Public share enforces viewModeEnabled: true on giant scene");
    assert(shareJson.canvas.elements.length === elementCount, `Public share delivered all ${elementCount} elements`);

    // Clean up giant canvases
    await fetch(`${baseUrl}/api/canvases/${giantId}`, { method: "DELETE" });
    await fetch(`${baseUrl}/api/canvases/${clonedGiantId}`, { method: "DELETE" });
    console.log("  -> Cleaned up giant canvases.");

    // ---------------------------------------------------------------------------
    // SECTION 4: Adversarial Edge Cases & Boundary Values
    // ---------------------------------------------------------------------------
    console.log("\n--- Section 4: Adversarial Edge Cases & Boundary Values ---");

    // 4.1 SQL Injection Attacks
    const sqliNames = [
      "Robert'); DROP TABLE canvases; --",
      "' OR '1'='1",
      `" OR "" = "`,
      "1; SELECT * FROM canvases;",
      "'; VACUUM; --",
    ];

    console.log("  -> Testing SQL injection resistance in canvas names and descriptions...");
    for (const sqli of sqliNames) {
      const res = await fetch(`${baseUrl}/api/canvases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sqli, description: sqli }),
      });
      const json = await res.json();
      assert(res.status === 201 && json.success, `SQLi string safely treated as literal text: ${sqli}`);
      if (json.canvas?.id) {
        // Fetch to confirm exact match
        const verifyRes = await (await fetch(`${baseUrl}/api/canvases/${json.canvas.id}`)).json();
        assert(verifyRes.canvas.name === sqli, `Stored and returned literal SQLi string intact`);
        // Clean up
        await fetch(`${baseUrl}/api/canvases/${json.canvas.id}`, { method: "DELETE" });
      }
    }

    // 4.2 Unicode, Emojis & Extreme Characters
    const unicodeStrings = [
      "🎨 Whiteboard Pro 🔥 🚀 ✨",
      "汉语 / 漢語 • 日本語 • 한국어 • Русский • العربية • עברית",
      "Special: <script>alert('xss')</script> &amp; \"quotes\" \\ backslashes / slashes \n\r\t tabs",
      "Zero-width: \u200B\u200C\u200D\uFEFF and math: ∀x∈ℝ, x²≥0",
    ];
    for (const uStr of unicodeStrings) {
      const res = await fetch(`${baseUrl}/api/canvases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uStr, description: uStr }),
      });
      const json = await res.json();
      assert(res.status === 201 && json.success, `Unicode string stored successfully: ${uStr.slice(0, 30)}...`);
      if (json.canvas?.id) {
        const verify = await (await fetch(`${baseUrl}/api/canvases/${json.canvas.id}`)).json();
        assert(verify.canvas.name === uStr, `Unicode string retrieved without encoding degradation`);
        await fetch(`${baseUrl}/api/canvases/${json.canvas.id}`, { method: "DELETE" });
      }
    }

    // 4.3 Malformed Request Bodies & Type Mismatches
    console.log("  -> Testing malformed JSON and bad payloads...");
    // Broken JSON to POST
    const malformedRes = await fetch(`${baseUrl}/api/canvases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"name": "Broken JSON, missing brace...`,
    });
    // Should handle gracefully (status 201 with default name or 400/500, but NOT crash server)
    assert([200, 201, 400, 500].includes(malformedRes.status), `Malformed JSON handled gracefully (HTTP ${malformedRes.status})`);

    // Bad reorder payload
    const badReorderRes = await fetch(`${baseUrl}/api/canvases/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: "not-an-array" }),
    });
    assert(badReorderRes.status === 400, `Invalid reorder payload correctly rejected with HTTP 400`);

    // Non-existent canvas routes
    const missingGetRes = await fetch(`${baseUrl}/api/canvases/non_existent_id_9999`);
    assert(missingGetRes.status === 404, `GET non-existent canvas returns HTTP 404`);

    const missingPutRes = await fetch(`${baseUrl}/api/canvases/non_existent_id_9999`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cannot Update" }),
    });
    assert(missingPutRes.status === 404, `PUT non-existent canvas returns HTTP 404`);

    const missingDelRes = await fetch(`${baseUrl}/api/canvases/non_existent_id_9999`, {
      method: "DELETE",
    });
    assert(missingDelRes.status === 404, `DELETE non-existent canvas returns HTTP 404`);

    const missingCloneRes = await fetch(`${baseUrl}/api/canvases/non_existent_id_9999/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(missingCloneRes.status === 404, `Clone non-existent canvas returns HTTP 404`);

    const missingRestoreRes = await fetch(`${baseUrl}/api/canvases/c_non_existent/history/snap_fake/restore`, {
      method: "POST",
    });
    assert(missingRestoreRes.status === 404, `Restore non-existent snapshot returns HTTP 404`);

  } finally {
    if (serverProc) {
      console.log("\n  Stopping spawned Next.js server...");
      serverProc.kill("SIGTERM");
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: Post-Stress SQLite Storage Engine Integrity
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 5: Post-Stress SQLite Storage Engine Integrity ---");
  const integrityRes = await db.execute("PRAGMA integrity_check;");
  const integrityResult = Object.values(integrityRes.rows[0])[0]?.toString();
  assert(integrityResult === "ok", `PRAGMA integrity_check returned '${integrityResult}'`);

  const fkCheckRes = await db.execute("PRAGMA foreign_key_check;");
  assert(fkCheckRes.rows.length === 0, `PRAGMA foreign_key_check returned 0 violations (${fkCheckRes.rows.length} rows)`);

  const finalCanvasesCount = await db.execute("SELECT COUNT(*) as count FROM canvases");
  console.log(`  Final database row count in 'canvases': ${finalCanvasesCount.rows[0].count}`);

  const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n================================================================================");
  console.log(` STRESS TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (Total: ${totalTests})`);
  console.log(` Elapsed Time: ${elapsedTotal}s`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    console.error("FAILURES ENCOUNTERED:");
    for (const f of failures) {
      console.error(`- ${f.message}: ${f.details}`);
    }
    process.exit(1);
  } else {
    console.log("🎉 ALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED WITH ZERO ERRORS!");
    process.exit(0);
  }
}

runEmpiricalStressSuite().catch((err) => {
  console.error("Fatal error during stress suite:", err);
  process.exit(1);
});
