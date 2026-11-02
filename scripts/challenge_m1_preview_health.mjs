/**
 * Empirical Challenge Harness for Milestone 1:
 * Remote VPS Connectivity, Proxy Routing & Health Route
 * 
 * Tests:
 * 1. Live network interaction with https://13.49.76.201.sslip.io:
 *    - Port 5500 ECONNREFUSED response handling in isServerOfflineError and checkVpsPortHealth
 *    - Port 8080 or active ports handling
 *    - Token validation (valid token, invalid token, missing token, cookie-based token)
 * 2. Route handler logic (simulating NextRequest / route.ts logic with live probes):
 *    - ?port=5500
 *    - ?port=invalid
 *    - ?port=8080
 *    - missing port
 *    - boundary & adversarial ports (0, -1, 65536, 99999, injection strings)
 * 3. Contract & Edge Case Verification:
 *    - AbortSignal and timeout handling
 *    - CORS and frame-ancestors headers
 *    - Latency tracking and error payload structures
 */

import * as vps from "../src/lib/vpsProxy.ts";

const VPS_HOST = "13.49.76.201.sslip.io";
const VPS_BASE_URL = `https://${VPS_HOST}`;
const VALID_TOKEN = "explaino_sec_8b41915d25547e2edd553bab03ea4cbd";
const INVALID_TOKEN = "invalid_token_99999";

class ChallengeRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  assert(condition, name, details = "") {
    if (condition) {
      this.passed++;
      this.results.push({ name, status: "PASS" });
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`);
    } else {
      this.failed++;
      this.results.push({ name, status: "FAIL", details });
      console.log(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
      if (details) console.log(`         \x1b[33mDetails: ${details}\x1b[0m`);
    }
  }

  heading(title) {
    console.log(`\n\x1b[36m=== ${title} ===\x1b[0m`);
  }

  summary() {
    console.log("\n=======================================================");
    console.log("       EMPIRICAL CHALLENGE VERIFICATION REPORT         ");
    console.log("=======================================================");
    console.log(`  Total Checks: ${this.passed + this.failed}`);
    console.log(`  Passed:       \x1b[32m${this.passed}\x1b[0m`);
    console.log(`  Failed:       \x1b[31m${this.failed}\x1b[0m`);
    console.log("=======================================================\n");
    return this.failed === 0;
  }
}

// Route Handler Simulator: replicate exact route.ts behavior against live VPS
async function simulateHealthRoute(queryPort, options = {}) {
  const port = vps.parsePort(queryPort, vps.DEFAULT_PREVIEW_PORT);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 8000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const token = options.token !== undefined ? options.token : VALID_TOKEN;
  const tokenQuery = token ? `?token=${token}` : "";
  const targetUrl = `${VPS_BASE_URL}/proxy/${port}/${tokenQuery}`;

  const start = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      signal: options.signal ?? controller.signal,
      cache: "no-store",
      headers: {
        Accept: "*/*",
        ...(options.headers || {}),
      },
    });
    clearTimeout(timeoutId);

    const bodyText = await res.text().catch(() => "");
    const isConnRefused = vps.isServerOfflineError(res.status, bodyText);
    const isOnline = res.status >= 200 && res.status < 400;
    const statusText = isConnRefused
      ? "ECONNREFUSED"
      : res.statusText || (isOnline ? "OK" : `HTTP ${res.status}`);

    return {
      port,
      isOnline,
      online: isOnline,
      statusCode: res.status,
      statusText,
      isConnectionRefused: isConnRefused,
      error: !isOnline ? (bodyText.trim() || statusText) : undefined,
      headers: Object.fromEntries(res.headers.entries()),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      port,
      isOnline: false,
      online: false,
      statusCode: 504,
      statusText: "Gateway Timeout",
      isConnectionRefused: false,
      error: err instanceof Error ? err.message : "Connection failed",
      headers: {},
      durationMs: Date.now() - start,
    };
  }
}

async function runEmpiricalChallenge() {
  const runner = new ChallengeRunner();

  // -------------------------------------------------------------------------
  // Part 1: Live Network Interaction with https://13.49.76.201.sslip.io
  // -------------------------------------------------------------------------
  runner.heading("Part 1: Live VPS Network Interaction & Protocol Verification");

  // 1.1 Inactive Port 5500 Live Network Response
  try {
    const port5500Url = `${VPS_BASE_URL}/proxy/5500/?token=${VALID_TOKEN}`;
    const res5500 = await fetch(port5500Url, { signal: AbortSignal.timeout(8000) });
    const text5500 = await res5500.text();

    runner.assert(
      res5500.status === 500,
      "Live VPS port 5500 returns HTTP 500 status",
      `Expected 500, got ${res5500.status}`
    );
    runner.assert(
      text5500.includes("ECONNREFUSED") || text5500.includes("0.0.0.0:5500"),
      "Live VPS port 5500 response body contains ECONNREFUSED signature",
      `Body: ${text5500.slice(0, 80)}`
    );
    runner.assert(
      vps.isServerOfflineError(res5500.status, text5500) === true,
      "isServerOfflineError(500, text) accurately categorizes live 5500 response as offline",
      `Result: ${vps.isServerOfflineError(res5500.status, text5500)}`
    );

    // Header validations
    const setCookie = res5500.headers.get("set-cookie") || "";
    runner.assert(
      setCookie.includes("explaino_token=") && setCookie.includes("SameSite=None") && setCookie.includes("Secure"),
      "Live VPS injects SameSite=None; Secure cookie for token persistence across iframe reloads",
      `Set-Cookie: ${setCookie}`
    );
    const csp = res5500.headers.get("content-security-policy") || "";
    runner.assert(
      csp.includes("frame-ancestors *"),
      "Live VPS includes 'frame-ancestors *' in CSP for canvas iframe embedding",
      `CSP: ${csp}`
    );
  } catch (err) {
    runner.assert(false, "Live network probe to port 5500 failed", err.message);
  }

  // 1.2 Active Port 8080 Live Network Response
  try {
    const port8080Url = `${VPS_BASE_URL}/proxy/8080/?token=${VALID_TOKEN}`;
    const res8080 = await fetch(port8080Url, { signal: AbortSignal.timeout(8000) });
    const text8080 = await res8080.text();

    runner.assert(
      res8080.status === 200,
      "Live VPS port 8080 returns HTTP 200 OK",
      `Expected 200, got ${res8080.status}`
    );
    runner.assert(
      text8080.includes("<!DOCTYPE html>") || text8080.includes("code-server"),
      "Live VPS port 8080 returns valid code-server HTML content",
      `Content preview: ${text8080.slice(0, 100)}`
    );
    runner.assert(
      vps.isServerOfflineError(res8080.status, text8080) === false,
      "isServerOfflineError(200, text) accurately does NOT flag active port 8080 as offline",
      `Result: ${vps.isServerOfflineError(res8080.status, text8080)}`
    );
  } catch (err) {
    runner.assert(false, "Live network probe to port 8080 failed", err.message);
  }

  // 1.3 Token Validation (Gatekeeper Enforcement)
  try {
    // Missing token
    const noTokenRes = await fetch(`${VPS_BASE_URL}/proxy/8080/`, { signal: AbortSignal.timeout(8000) });
    const noTokenText = await noTokenRes.text();
    runner.assert(
      noTokenRes.status === 403,
      "Live VPS rejects request without token with HTTP 403 Forbidden",
      `Got status ${noTokenRes.status}`
    );
    runner.assert(
      noTokenText.toLowerCase().includes("token required"),
      "Missing token error message states token is required",
      `Message: ${noTokenText.slice(0, 80)}`
    );

    // Invalid token
    const badTokenRes = await fetch(`${VPS_BASE_URL}/proxy/8080/?token=${INVALID_TOKEN}`, {
      signal: AbortSignal.timeout(8000),
    });
    runner.assert(
      badTokenRes.status === 403,
      "Live VPS rejects request with invalid token with HTTP 403 Forbidden",
      `Got status ${badTokenRes.status}`
    );

    // Cookie-authenticated request (without token query parameter)
    const cookieRes = await fetch(`${VPS_BASE_URL}/proxy/8080/`, {
      headers: {
        Cookie: `explaino_token=${VALID_TOKEN}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    runner.assert(
      cookieRes.status === 200,
      "Live VPS accepts authentication via Cookie header (explaino_token) for seamless sub-resources",
      `Got status ${cookieRes.status}`
    );
  } catch (err) {
    runner.assert(false, "Token validation live network tests failed", err.message);
  }

  // -------------------------------------------------------------------------
  // Part 2: Route Handler Simulation & Query Edge Cases
  // -------------------------------------------------------------------------
  runner.heading("Part 2: Route Handler Behavior & Query Edge Cases");

  // 2.1 Route Handler: ?port=5500
  const sim5500 = await simulateHealthRoute("5500");
  runner.assert(
    sim5500.port === 5500,
    "Route simulation for ?port=5500 outputs port 5500",
    `Got port ${sim5500.port}`
  );
  runner.assert(
    sim5500.isOnline === false && sim5500.online === false,
    "Route simulation for ?port=5500 reports isOnline: false",
    `isOnline: ${sim5500.isOnline}`
  );
  runner.assert(
    sim5500.isConnectionRefused === true,
    "Route simulation for ?port=5500 flags isConnectionRefused: true",
    `isConnectionRefused: ${sim5500.isConnectionRefused}`
  );
  runner.assert(
    sim5500.statusText === "ECONNREFUSED",
    "Route simulation for ?port=5500 provides statusText: 'ECONNREFUSED'",
    `statusText: ${sim5500.statusText}`
  );
  runner.assert(
    typeof sim5500.error === "string" && sim5500.error.includes("ECONNREFUSED"),
    "Route simulation for ?port=5500 includes informative error string",
    `error: ${sim5500.error?.slice(0, 50)}`
  );

  // 2.2 Route Handler: ?port=8080
  const sim8080 = await simulateHealthRoute("8080");
  runner.assert(
    sim8080.port === 8080,
    "Route simulation for ?port=8080 outputs port 8080",
    `Got port ${sim8080.port}`
  );
  runner.assert(
    sim8080.isOnline === true && sim8080.online === true,
    "Route simulation for ?port=8080 reports isOnline: true",
    `isOnline: ${sim8080.isOnline}`
  );
  runner.assert(
    sim8080.statusCode === 200,
    "Route simulation for ?port=8080 returns statusCode 200",
    `statusCode: ${sim8080.statusCode}`
  );
  runner.assert(
    sim8080.isConnectionRefused === false,
    "Route simulation for ?port=8080 reports isConnectionRefused: false",
    `isConnectionRefused: ${sim8080.isConnectionRefused}`
  );
  runner.assert(
    sim8080.error === undefined,
    "Route simulation for active port 8080 leaves error undefined",
    `error: ${sim8080.error}`
  );

  // 2.3 Route Handler: ?port=invalid
  const simInvalid = await simulateHealthRoute("invalid");
  runner.assert(
    simInvalid.port === 5500,
    "Route simulation for ?port=invalid safely falls back to default port 5500",
    `Got port ${simInvalid.port}`
  );
  runner.assert(
    simInvalid.isConnectionRefused === true,
    "Route simulation for ?port=invalid probes default port 5500 and recognizes offline state",
    `isConnectionRefused: ${simInvalid.isConnectionRefused}`
  );

  // 2.4 Route Handler: missing port (null / undefined)
  const simMissing = await simulateHealthRoute(null);
  runner.assert(
    simMissing.port === 5500,
    "Route simulation for missing port query parameter falls back to default port 5500",
    `Got port ${simMissing.port}`
  );
  runner.assert(
    simMissing.isOnline === false,
    "Route simulation for missing port reports isOnline: false (targeting 5500)",
    `isOnline: ${simMissing.isOnline}`
  );

  // 2.5 Route Handler: Boundary and Adversarial Query Inputs
  const boundaryTests = [
    { input: "0", expectedPort: 5500, name: "port=0 falls back to 5500" },
    { input: "-1", expectedPort: 5500, name: "port=-1 falls back to 5500" },
    { input: "65536", expectedPort: 5500, name: "port=65536 falls back to 5500" },
    { input: "99999", expectedPort: 5500, name: "port=99999 falls back to 5500" },
    { input: "../../../etc/passwd", expectedPort: 5500, name: "path traversal string falls back to 5500" },
    { input: "5500<script>", expectedPort: 5500, name: "XSS injection string falls back to 5500" },
    { input: "   8080   ", expectedPort: 8080, name: "whitespace-padded port '   8080   ' parses to 8080" },
    { input: ":8080", expectedPort: 8080, name: "colon-prefixed port ':8080' parses to 8080" },
  ];

  for (const bt of boundaryTests) {
    const parsed = vps.parsePort(bt.input, 5500);
    runner.assert(parsed === bt.expectedPort, `Adversarial check: ${bt.name}`, `Parsed: ${parsed}`);
  }

  // -------------------------------------------------------------------------
  // Part 3: Client Health Probe checkVpsPortHealth & Timeout Resilience
  // -------------------------------------------------------------------------
  runner.heading("Part 3: Client Health Probe Function & Timeout Behavior");

  // Test abort signal cancellation handling
  const abortController = new AbortController();
  abortController.abort();

  // Test with pre-aborted signal
  const abortedResult = await vps.checkVpsPortHealth(5500, {
    signal: abortController.signal,
    timeoutMs: 100,
  });

  runner.assert(
    abortedResult.isOnline === false,
    "checkVpsPortHealth gracefully handles pre-aborted signal without crashing",
    `isOnline: ${abortedResult.isOnline}, error: ${abortedResult.error}`
  );
  runner.assert(
    abortedResult.port === 5500,
    "checkVpsPortHealth returns the resolved port even on error/abort",
    `Port: ${abortedResult.port}`
  );
  runner.assert(
    typeof abortedResult.latencyMs === "number" && abortedResult.latencyMs >= 0,
    "checkVpsPortHealth includes non-negative latencyMs metric",
    `latencyMs: ${abortedResult.latencyMs}`
  );

  // -------------------------------------------------------------------------
  // Part 4: URL Builders & Security Token Guarantees
  // -------------------------------------------------------------------------
  runner.heading("Part 4: URL Builders & Security Token Invariant Testing");

  // Invariant 1: buildDirectVpsUrl always attaches the security token by default
  const directUrl = vps.buildDirectVpsUrl(5500, "/");
  runner.assert(
    directUrl.includes(`token=${VALID_TOKEN}`),
    "buildDirectVpsUrl attaches the authoritative security token by default",
    `URL: ${directUrl}`
  );

  // Invariant 2: buildExternalTabUrl always attaches the security token
  const externalUrl = vps.buildExternalTabUrl(8080, "/app");
  runner.assert(
    externalUrl.includes(`token=${VALID_TOKEN}`),
    "buildExternalTabUrl attaches the authoritative security token",
    `URL: ${externalUrl}`
  );

  // Invariant 3: buildRewriteProxyUrl produces relative path without token
  const rewriteUrl = vps.buildRewriteProxyUrl(3000, "/page");
  runner.assert(
    rewriteUrl === "/preview/3000/page",
    "buildRewriteProxyUrl generates clean /preview/3000/page without leaking token to client URL",
    `URL: ${rewriteUrl}`
  );

  // Invariant 4: parseTarget handles compound omnibox strings
  const compound1 = vps.parseTarget("localhost:5500/test/index.html?a=1#sec");
  runner.assert(
    compound1.port === 5500 && compound1.path === "/test/index.html?a=1#sec",
    "parseTarget parses 'localhost:5500/test/index.html?a=1#sec' preserving query and hash",
    `Parsed: ${JSON.stringify(compound1)}`
  );

  const compound2 = vps.parseTarget("http://127.0.0.1:8080/dashboard");
  runner.assert(
    compound2.port === 8080 && compound2.path === "/dashboard",
    "parseTarget parses 'http://127.0.0.1:8080/dashboard' cleanly",
    `Parsed: ${JSON.stringify(compound2)}`
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const success = runner.summary();
  process.exit(success ? 0 : 1);
}

runEmpiricalChallenge().catch((err) => {
  console.error("Fatal challenge harness error:", err);
  process.exit(1);
});
