import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

async function main() {
  console.log("Starting Adversarial Stress-Tests for Milestone 1...");
  const dbDir = path.join(process.cwd(), "data");
  const dbPath = path.resolve(dbDir, "explaino.db").replace(/\\/g, "/");
  const db = createClient({ url: `file:${dbPath}` });

  let testsPassed = 0;
  let testsFailed = 0;

  function check(cond, msg) {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
      testsPassed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      testsFailed++;
    }
  }

  // 1. SQL Injection Stress Testing
  console.log("\n1. SQL Injection Stress-Tests:");
  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE canvases; --",
    "c_test' UNION SELECT id, name, '', 0, '', 0, '', 0, 0 FROM canvases --",
    "admin' --",
    "' OR 1=1 #",
    "\" OR \"\"=\"",
    "1'; ATTACH DATABASE 'evil.db' AS evil; --",
  ];

  for (const payload of sqliPayloads) {
    try {
      const res = await db.execute({
        sql: "SELECT * FROM canvases WHERE id = ? OR share_slug = ?",
        args: [payload, payload],
      });
      check(res.rows.length === 0, `SQLi safely parameterized without syntax/logic leakage: "${payload}"`);
    } catch (err) {
      check(false, `Unexpected error on SQLi test: ${err.message}`);
    }
  }

  // Verify schema survived unchanged
  const masterCheck = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='canvases'");
  check(masterCheck.rows.length === 1, "canvases table still intact after injection attacks");

  // 2. Cascade Deletion with Deep Foreign Keys
  console.log("\n2. Cascade Deletion Stress-Tests:");
  const parentId = `c_adv_parent_${Date.now()}`;
  const now = Date.now();

  await db.batch(
    [
      {
        sql: "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, 'Adv Parent', ?, ?)",
        args: [parentId, now, now],
      },
      {
        sql: "INSERT INTO canvas_data (canvas_id, elements, updated_at) VALUES (?, '[]', ?)",
        args: [parentId, now],
      },
      {
        sql: "INSERT INTO canvas_history (id, canvas_id, elements, created_at) VALUES (?, ?, '[]', ?)",
        args: [`snap_adv_${now}`, parentId, now],
      },
      {
        sql: "INSERT INTO canvas_todos (id, canvas_id, text, created_at, updated_at) VALUES (?, ?, 'Adv Todo', ?, ?)",
        args: [`todo_adv_${now}`, parentId, now, now],
      },
      {
        sql: "INSERT INTO canvas_notes (id, canvas_id, audio_data, created_at) VALUES (?, ?, 'audio...', ?)",
        args: [`note_adv_${now}`, parentId, now],
      },
      {
        sql: "INSERT INTO canvas_extensions (canvas_id, extension_id, updated_at) VALUES (?, 'ext_adv', ?)",
        args: [parentId, now],
      },
    ],
    "write"
  );

  // Direct delete
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [parentId] });

  // Check child tables
  const child1 = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_data WHERE canvas_id = ?", args: [parentId] })).rows[0].c;
  const child2 = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_history WHERE canvas_id = ?", args: [parentId] })).rows[0].c;
  const child3 = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_todos WHERE canvas_id = ?", args: [parentId] })).rows[0].c;
  const child4 = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_notes WHERE canvas_id = ?", args: [parentId] })).rows[0].c;
  const child5 = (await db.execute({ sql: "SELECT COUNT(*) as c FROM canvas_extensions WHERE canvas_id = ?", args: [parentId] })).rows[0].c;

  check(child1 === 0 && child2 === 0 && child3 === 0 && child4 === 0 && child5 === 0, "All 5 child tables completely purged on cascade delete");

  // 3. Transaction Rollback on Failure
  console.log("\n3. Transaction Atomicity Stress-Tests:");
  const testId = `c_atomic_${Date.now()}`;
  let batchFailed = false;
  try {
    await db.batch(
      [
        {
          sql: "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, 'Atomic Test', ?, ?)",
          args: [testId, now, now],
        },
        {
          // Intentional constraint violation: NOT NULL column violation or duplicate PK
          sql: "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, NULL, ?, ?)",
          args: [`${testId}_invalid`, now, now],
        },
      ],
      "write"
    );
  } catch (err) {
    batchFailed = true;
  }

  check(batchFailed === true, "Batch failed due to invalid statement");
  const checkAtomic = await db.execute({ sql: "SELECT COUNT(*) as c FROM canvases WHERE id = ?", args: [testId] });
  check(checkAtomic.rows[0].c === 0, "Transaction rolled back completely: statement 1 was NOT committed when statement 2 failed");

  // 4. Boundary Conditions & Huge Payloads
  console.log("\n4. Boundary Conditions & Payload Resilience:");
  const bigElements = Array.from({ length: 1000 }, (_, i) => ({
    id: `big_el_${i}`,
    type: "rectangle",
    x: i * 10,
    y: i * 10,
    width: 100,
    height: 50,
    strokeColor: "#ff0000",
    customData: { complex: { nested: [1, 2, 3], deep: "value" } },
  }));
  const bigId = `c_big_${Date.now()}`;

  await db.batch(
    [
      {
        sql: "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, 'Big Payload Canvas', ?, ?)",
        args: [bigId, now, now],
      },
      {
        sql: "INSERT INTO canvas_data (canvas_id, elements, updated_at) VALUES (?, ?, ?)",
        args: [bigId, JSON.stringify(bigElements), now],
      },
    ],
    "write"
  );

  const bigCheck = await db.execute({ sql: "SELECT elements FROM canvas_data WHERE canvas_id = ?", args: [bigId] });
  const parsedBig = JSON.parse(bigCheck.rows[0].elements);
  check(parsedBig.length === 1000, "1,000 complex canvas elements safely persisted and parsed without truncation");

  // Clean up
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [bigId] });

  // 5. Special Character Handling
  console.log("\n5. Unicode & Special Character Handling:");
  const unicodeId = `c_unicode_${Date.now()}`;
  const unicodeName = "🌟 Multi-Language / 中文 / 日本語 / العربية / 👩‍💻 Canvas \u0000 Test";
  // Note: SQLite strings cannot contain null bytes (\u0000), let's test sanitized unicode
  const unicodeSafeName = "🌟 Multi-Language / 中文 / 日本語 / العربية / 👩‍💻 Canvas's \"Special\" `Quotes` <script>alert(1)</script>";

  await db.batch(
    [
      {
        sql: "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        args: [unicodeId, unicodeSafeName, now, now],
      },
      {
        sql: "INSERT INTO canvas_data (canvas_id, elements, updated_at) VALUES (?, '[]', ?)",
        args: [unicodeId, now],
      },
    ],
    "write"
  );

  const unicodeCheck = await db.execute({ sql: "SELECT name FROM canvases WHERE id = ?", args: [unicodeId] });
  check(unicodeCheck.rows[0].name === unicodeSafeName, "Complex unicode, emojis, quotes, and HTML tags stored and retrieved verbatim");

  // Clean up
  await db.execute({ sql: "DELETE FROM canvases WHERE id = ?", args: [unicodeId] });

  console.log(`\nAdversarial Tests Summary: ${testsPassed} passed, ${testsFailed} failed.`);
  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Adversarial test error:", err);
  process.exit(1);
});
