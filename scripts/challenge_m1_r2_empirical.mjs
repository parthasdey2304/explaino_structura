/**
 * Milestone 1 Iteration 2 Challenger Deep Empirical Verification
 * Target: src/lib/vpsProxy.ts
 *
 * Verifies:
 * 1. Bare port omnibox inputs: "5500/index.html" -> port 5500, path "/index.html" (not duplicated).
 * 2. Non-string inputs: no unhandled TypeErrors.
 * 3. Path traversal attacks: "/../../etc/passwd" remains safely contained under "/proxy/5500/etc/passwd".
 * 4. IPv6 and port 0 edge cases.
 */

import * as vps from "../src/lib/vpsProxy.ts";

let total = 0;
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, testName, details = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
  } else {
    failed++;
    errors.push({ testName, details });
    console.log(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} - ${details}`);
  }
}

console.log("================================================================================");
console.log("   CHALLENGER EMPIRICAL VERIFICATION - M1 ITERATION 2 DEEP DIVE");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// 1. BARE PORT OMNIBOX INPUTS
// -----------------------------------------------------------------------------
console.log("--- 1. Bare Port Omnibox Inputs & Path Duplication Defense ---");

const barePortCases = [
  { input: "5500/index.html", expectedPort: 5500, expectedPath: "/index.html" },
  { input: "3000/dashboard", expectedPort: 3000, expectedPath: "/dashboard" },
  { input: "8080/api/v1/health", expectedPort: 8080, expectedPath: "/api/v1/health" },
  { input: "5173/src/main.tsx?ts=123#app", expectedPort: 5173, expectedPath: "/src/main.tsx?ts=123#app" },
  { input: "5500", expectedPort: 5500, expectedPath: "/" },
  { input: "5500/", expectedPort: 5500, expectedPath: "/" },
  { input: ":5500/index.html", expectedPort: 5500, expectedPath: "/index.html" },
  { input: ":8080/preview", expectedPort: 8080, expectedPath: "/preview" },
  { input: "localhost:5500/index.html", expectedPort: 5500, expectedPath: "/index.html" },
  { input: "127.0.0.1:3000/test", expectedPort: 3000, expectedPath: "/test" },
  { input: "http://localhost:5500/index.html", expectedPort: 5500, expectedPath: "/index.html" },
];

for (const tc of barePortCases) {
  const target = vps.parseTarget(tc.input);
  assert(
    target.port === tc.expectedPort,
    `parseTarget(${JSON.stringify(tc.input)}) -> port ${tc.expectedPort}`,
    `Got port: ${target.port}`
  );
  assert(
    target.path === tc.expectedPath,
    `parseTarget(${JSON.stringify(tc.input)}) -> path ${tc.expectedPath}`,
    `Got path: ${target.path}`
  );

  // Check downstream URL construction
  const url = vps.buildDirectVpsUrl(target.port, target.path);
  const parsed = new URL(url);
  const expectedPrefix = `/proxy/${tc.expectedPort}`;
  assert(
    parsed.pathname === `${expectedPrefix}${tc.expectedPath.split(/[?#]/)[0]}`,
    `Downstream URL has no port duplication: ${parsed.pathname}`,
    `Expected prefix ${expectedPrefix}, full pathname: ${parsed.pathname}`
  );
  assert(
    !parsed.pathname.includes(`/proxy/${tc.expectedPort}/${tc.expectedPort}/`),
    `No duplicated port in path for ${tc.input}`,
    `Pathname: ${parsed.pathname}`
  );
}

// -----------------------------------------------------------------------------
// 2. NON-STRING INPUTS (DEFENSIVE TYPE SAFETY)
// -----------------------------------------------------------------------------
console.log("\n--- 2. Non-String & Malformed Inputs (No Unhandled Exceptions) ---");

const nonStringInputs = [
  null,
  undefined,
  true,
  false,
  {},
  { port: 5500 },
  [],
  [5500],
  [3000, 8080],
  Object.create(null),
  () => 5500,
  Symbol("5500"),
  BigInt(5500),
  new Date(),
  new RegExp("5500"),
  new Map(),
  new Set([5500]),
];

for (const input of nonStringInputs) {
  const desc = typeof input === "object" && input !== null
    ? Object.getPrototypeOf(input) === null
      ? "Object.create(null)"
      : input.constructor?.name || "object"
    : typeof input === "symbol"
    ? "Symbol"
    : typeof input === "bigint"
    ? "BigInt"
    : String(input);

  // Test parseTarget
  let targetThrew = false;
  let targetErr = "";
  let target;
  try {
    target = vps.parseTarget(input);
  } catch (err) {
    targetThrew = true;
    targetErr = err.message;
  }
  assert(!targetThrew, `parseTarget(${desc}) does not throw TypeError`, targetErr);
  if (!targetThrew) {
    assert(
      typeof target.port === "number" && typeof target.path === "string",
      `parseTarget(${desc}) returns valid PreviewTarget { port, path }`,
      JSON.stringify(target)
    );
  }

  // Test parsePort
  let portThrew = false;
  let portErr = "";
  let port;
  try {
    port = vps.parsePort(input);
  } catch (err) {
    portThrew = true;
    portErr = err.message;
  }
  assert(!portThrew, `parsePort(${desc}) does not throw TypeError`, portErr);
  if (!portThrew) {
    assert(
      typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535,
      `parsePort(${desc}) returns valid TCP port: ${port}`,
      `Got: ${port}`
    );
  }

  // Test normalizePath
  let pathThrew = false;
  let pathErr = "";
  let normPath;
  try {
    normPath = vps.normalizePath(input);
  } catch (err) {
    pathThrew = true;
    pathErr = err.message;
  }
  assert(!pathThrew, `normalizePath(${desc}) does not throw TypeError`, pathErr);
  if (!pathThrew) {
    assert(
      typeof normPath === "string" && normPath.startsWith("/"),
      `normalizePath(${desc}) returns valid root path: ${normPath}`,
      `Got: ${normPath}`
    );
  }
}

// -----------------------------------------------------------------------------
// 3. PATH TRAVERSAL ATTACKS
// -----------------------------------------------------------------------------
console.log("\n--- 3. Path Traversal Attacks & Sandbox Containment ---");

const traversalVectors = [
  "/../../etc/passwd",
  "/../../../../../../../../../../etc/shadow",
  "../../etc/passwd",
  "/a/b/../../../../etc/passwd",
  "/proxy/5500/../../etc/passwd",
  "/./././../../etc/passwd",
  "/....//....//etc/passwd",
  "/index.html/../../../etc/passwd",
  "../",
  "../../",
  "/..",
  "/../",
  "/a/../b/../../c",
  "/windows/../win.ini",
];

for (const vector of traversalVectors) {
  const normalized = vps.normalizePath(vector);
  const segs = normalized.split("/");
  const hasDotDot = segs.some(s => s === ".." || s === ".");
  assert(
    !hasDotDot,
    `normalizePath(${JSON.stringify(vector)}) has no unparsed dot/dot-dot segments: ${normalized}`,
    `Result: ${normalized}`
  );
  assert(
    normalized.startsWith("/"),
    `normalizePath(${JSON.stringify(vector)}) starts with '/': ${normalized}`,
    `Result: ${normalized}`
  );

  const directUrl = vps.buildDirectVpsUrl(5500, vector);
  const parsed = new URL(directUrl);
  assert(
    parsed.pathname.startsWith("/proxy/5500"),
    `buildDirectVpsUrl(5500, ${JSON.stringify(vector)}) stays contained under /proxy/5500`,
    `Pathname escaped to: ${parsed.pathname}`
  );
  assert(
    !parsed.pathname.startsWith("/etc/") && !parsed.pathname.startsWith("/windows/"),
    `buildDirectVpsUrl does not escape to root filesystem path: ${parsed.pathname}`,
    `Pathname: ${parsed.pathname}`
  );
}

// -----------------------------------------------------------------------------
// 4. IPV6 AND PORT 0 EDGE CASES
// -----------------------------------------------------------------------------
console.log("\n--- 4. IPv6 and Port 0 Edge Cases ---");

const networkEdgeCases = [
  // IPv6 bracketed hosts
  { input: "[::1]:8000", expected: 8000, reason: "IPv6 loopback with port 8000" },
  { input: "[::1]:3000", expected: 3000, reason: "IPv6 loopback with port 3000" },
  { input: "[::1]", expected: 5500, reason: "IPv6 loopback without port falls back" },
  { input: "[fe80::1ff:fe23:4567:890a]:8080", expected: 8080, reason: "IPv6 link-local with port 8080" },
  { input: "http://[::1]:9000/api", expected: 9000, reason: "IPv6 HTTP URL with port 9000" },
  { input: "http://[::1]/api", expected: 80, reason: "IPv6 HTTP URL without port defaults to 80" },
  { input: "https://[::1]/api", expected: 443, reason: "IPv6 HTTPS URL without port defaults to 443" },

  // Port 0 edge cases (Port 0 is reserved and invalid for HTTP preview)
  { input: 0, expected: 5500, reason: "Numeric 0 falls back to 5500" },
  { input: "0", expected: 5500, reason: "String '0' falls back to 5500" },
  { input: ":0", expected: 5500, reason: "Colon ':0' falls back to 5500" },
  { input: "localhost:0", expected: 5500, reason: "localhost:0 falls back to 5500" },
  { input: "http://localhost:0", expected: 5500, reason: "http://localhost:0 falls back to 5500" },
  { input: "https://localhost:0", expected: 5500, reason: "https://localhost:0 falls back to 5500" },
  { input: "http://127.0.0.1:0/test", expected: 5500, reason: "http://127.0.0.1:0/test falls back to 5500" },
  { input: "http://[::1]:0/test", expected: 5500, reason: "http://[::1]:0/test falls back to 5500" },

  // Extreme Port Boundaries
  { input: -1, expected: 5500, reason: "Port -1 falls back to 5500" },
  { input: 65535, expected: 65535, reason: "Port 65535 is max valid TCP port" },
  { input: 65536, expected: 5500, reason: "Port 65536 exceeds max TCP port and falls back" },
  { input: "http://localhost:65536", expected: 5500, reason: "http://localhost:65536 falls back to 5500" },
];

for (const nec of networkEdgeCases) {
  const result = vps.parsePort(nec.input);
  assert(
    result === nec.expected,
    `parsePort(${JSON.stringify(nec.input)}) -> ${nec.expected} (${nec.reason})`,
    `Got: ${result}, expected: ${nec.expected}`
  );
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log("   EMPIRICAL CHALLENGER VERIFICATION RESULTS");
console.log("================================================================================");
console.log(`  Total Checks: ${total}`);
console.log(`  Passed:       \x1b[32m${passed}\x1b[0m`);
console.log(`  Failed:       \x1b[31${failed > 0 ? "1" : "2"}m${failed}\x1b[0m`);
console.log("================================================================================\n");

if (failed > 0) {
  console.error("FAILURES:");
  for (const err of errors) {
    console.error(`- ${err.testName}: ${err.details}`);
  }
  process.exit(1);
} else {
  console.log("All empirical challenge checks PASSED cleanly! 🚀\n");
  process.exit(0);
}
