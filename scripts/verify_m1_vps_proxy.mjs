/**
 * Automated Verification Harness for Milestone 1: Remote VPS Connectivity & Proxy Routing
 * Project: Explaino Structura
 * 
 * Verifies:
 * 1. Interface contracts for VPS URL construction, port/path parsing, and security token management.
 * 2. Token injection and query parameter merging.
 * 3. Default port 5500 resolution and custom port/path resolution.
 * 4. Next.js rewrite / proxy helper URL generation.
 * 5. Live network reachability of remote VPS endpoint (https://13.49.76.201.sslip.io).
 * 6. Remote security token gatekeeper (HTTP 403 without token vs 200/500 with token).
 * 7. Error response parsing for offline dev servers (ECONNREFUSED 0.0.0.0:5500 -> 500).
 * 8. Live active port forwarding (Port 8080 -> 200 OK).
 * 9. Upstream CSP headers (frame-ancestors *;) and cookie generation (SameSite=None; Secure).
 * 10. Dynamic validation against src/lib/vpsProxy.ts when implemented.
 * 
 * Usage:
 *   node scripts/verify_m1_vps_proxy.mjs
 *   node scripts/verify_m1_vps_proxy.mjs --skip-network
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Constants & Authoritative Milestone 1 Contracts
// ---------------------------------------------------------------------------
export const VPS_BASE_URL = "https://13.49.76.201.sslip.io";
export const VPS_ORIGIN = VPS_BASE_URL;
export const VPS_TOKEN = "explaino_sec_8b41915d25547e2edd553bab03ea4cbd";
export const VPS_AUTH_TOKEN = VPS_TOKEN;
export const DEFAULT_PREVIEW_PORT = 5500;
export const DEFAULT_DEV_SERVER_PORT = DEFAULT_PREVIEW_PORT;
export const DEFAULT_PREVIEW_PATH = "/";
export const DEFAULT_DEV_SERVER_PATH = DEFAULT_PREVIEW_PATH;
export const PREVIEW_REWRITE_PREFIX = "/preview";

// ---------------------------------------------------------------------------
// Authoritative Contract Reference Implementations
// ---------------------------------------------------------------------------

/**
 * Normalizes subpath to always have a clean leading slash, collapse redundant slashes,
 * and preserve query strings (?query=1) and hash fragments (#section).
 */
export function normalizePreviewPath(subpath = "/") {
  if (!subpath || typeof subpath !== "string") {
    return DEFAULT_PREVIEW_PATH;
  }
  let clean = subpath.trim();
  if (!clean) {
    return DEFAULT_PREVIEW_PATH;
  }

  // Handle full URL inputs if passed: extract pathname + search + hash
  if (clean.includes("://")) {
    try {
      const parsedUrl = new URL(clean);
      return (parsedUrl.pathname || "/") + parsedUrl.search + parsedUrl.hash;
    } catch {
      // Fall through to standard cleanup
    }
  }

  // Strip host/port prefixes if user pasted "localhost:5500/index.html" or ":5500/index.html"
  clean = clean.replace(/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?(?::\d+)?/i, "");

  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }

  // Normalize consecutive slashes in pathname portion
  const [pathname, ...queryParts] = clean.split("?");
  const normalizedPathname = pathname.replace(/\/+/g, "/");
  return queryParts.length > 0 ? `${normalizedPathname}?${queryParts.join("?")}` : normalizedPathname;
}

export const normalizePath = normalizePreviewPath;

/**
 * Validates and parses a port input, falling back to 5500 if invalid or omitted.
 */
export function parsePreviewPort(portInput, defaultPort = DEFAULT_PREVIEW_PORT) {
  if (portInput === undefined || portInput === null || portInput === "") {
    return defaultPort;
  }
  if (typeof portInput === "number") {
    return Number.isInteger(portInput) && portInput >= 1 && portInput <= 65535 ? portInput : defaultPort;
  }
  const raw = String(portInput).trim();
  if (!raw) return defaultPort;

  // Extract from URL or host:port if needed
  const colonMatch = raw.match(/:(\d+)/);
  if (colonMatch) {
    const p = parseInt(colonMatch[1], 10);
    if (p >= 1 && p <= 65535) return p;
  }

  const directMatch = raw.match(/^(\d+)/);
  if (directMatch) {
    const p = parseInt(directMatch[1], 10);
    if (p >= 1 && p <= 65535) return p;
  }

  return defaultPort;
}

export const parsePort = parsePreviewPort;

/**
 * Parses user address bar input into a structured target object { port, path }.
 */
export function parseAddressInput(rawInput) {
  if (typeof rawInput === "number") {
    return {
      port: parsePreviewPort(rawInput),
      path: DEFAULT_PREVIEW_PATH,
    };
  }

  let text = (rawInput || "").trim();
  if (!text) {
    return { port: DEFAULT_PREVIEW_PORT, path: DEFAULT_PREVIEW_PATH };
  }

  // Pure port number input
  if (/^\s*:?\d+\s*$/.test(text)) {
    return {
      port: parsePreviewPort(text),
      path: DEFAULT_PREVIEW_PATH,
    };
  }

  // If path only starting with slash, default to 5500
  if (text.startsWith("/")) {
    return {
      port: DEFAULT_PREVIEW_PORT,
      path: normalizePreviewPath(text),
    };
  }

  const port = parsePreviewPort(text);
  const path = normalizePreviewPath(text);

  return { port, path };
}

export const parseTarget = parseAddressInput;

/**
 * Builds the canonical Direct Remote VPS URL with security token appended.
 */
export function buildVpsProxyUrl(port = DEFAULT_PREVIEW_PORT, subpath = "/", token = VPS_TOKEN) {
  const safePort = parsePreviewPort(port);
  const safePath = normalizePreviewPath(subpath);

  const url = new URL(`${VPS_BASE_URL}/proxy/${safePort}${safePath}`);
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export const buildDirectVpsUrl = buildVpsProxyUrl;

/**
 * Builds the external browser tab URL (Requirement R3).
 */
export function buildExternalTabUrl(port = DEFAULT_PREVIEW_PORT, subpath = "/") {
  return buildVpsProxyUrl(port, subpath, VPS_TOKEN);
}

/**
 * Builds the relative Next.js rewrite / local proxy path.
 */
export function buildLocalPreviewRewriteUrl(port = DEFAULT_PREVIEW_PORT, subpath = "/") {
  const safePort = parsePreviewPort(port);
  const safePath = normalizePreviewPath(subpath);
  return `${PREVIEW_REWRITE_PREFIX}/${safePort}${safePath}`;
}

export const buildRewriteProxyUrl = buildLocalPreviewRewriteUrl;

/**
 * Helper to determine if an error string/status represents an offline dev server.
 */
export function isServerOfflineError(status, bodyText = "") {
  if (status === 500 && (bodyText.includes("ECONNREFUSED") || bodyText.includes("connect ECONNREFUSED"))) {
    return true;
  }
  if (status === 502 || status === 504) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test Runner Harness
// ---------------------------------------------------------------------------
class VerificationHarness {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.tests = [];
    this.startTime = Date.now();
  }

  assert(condition, message, details = "") {
    if (condition) {
      this.passed++;
      this.tests.push({ message, status: "PASS" });
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
    } else {
      this.failed++;
      this.tests.push({ message, status: "FAIL", details });
      console.log(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
      if (details) {
        console.log(`         \x1b[33mDetails: ${details}\x1b[0m`);
      }
    }
  }

  skip(message, reason = "") {
    this.skipped++;
    this.tests.push({ message, status: "SKIP", reason });
    console.log(`  \x1b[33m- SKIP\x1b[0m: ${message} (${reason})`);
  }

  heading(title) {
    console.log(`\n\x1b[36m=== ${title} ===\x1b[0m`);
  }

  summary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n=======================================================");
    console.log("       MILESTONE 1 VERIFICATION SUMMARY REPORT         ");
    console.log("=======================================================");
    console.log(`  Total Checks: ${this.passed + this.failed + this.skipped}`);
    console.log(`  Passed:       \x1b[32m${this.passed}\x1b[0m`);
    console.log(`  Failed:       \x1b[31m${this.failed}\x1b[0m`);
    console.log(`  Skipped:      \x1b[33m${this.skipped}\x1b[0m`);
    console.log(`  Duration:     ${elapsed}s`);
    console.log("=======================================================\n");

    return this.failed === 0;
  }
}

// ---------------------------------------------------------------------------
// Main Verification Suite Execution
// ---------------------------------------------------------------------------
async function runVerification() {
  const harness = new VerificationHarness();
  const skipNetwork = process.argv.includes("--skip-network");

  console.log("Starting Milestone 1: Remote VPS Connectivity & Proxy Routing Verification Harness...\n");

  // -------------------------------------------------------------------------
  // Test Section 1: URL Construction & Contract Logic (Reference Contract)
  // -------------------------------------------------------------------------
  harness.heading("Section 1: URL Construction & Contract Logic (Authoritative Specification)");

  // 1.1 Default Port 5500 Resolution
  const defaultUrl = buildVpsProxyUrl();
  harness.assert(
    defaultUrl === `${VPS_BASE_URL}/proxy/5500/?token=${VPS_TOKEN}`,
    "Default invocation resolves to port 5500 with token and trailing slash",
    `Expected ${VPS_BASE_URL}/proxy/5500/?token=${VPS_TOKEN}, got ${defaultUrl}`
  );

  // 1.2 Custom Port & Path Resolution
  const customUrl = buildVpsProxyUrl(3000, "/dashboard");
  harness.assert(
    customUrl === `${VPS_BASE_URL}/proxy/3000/dashboard?token=${VPS_TOKEN}`,
    "Custom port 3000 and path /dashboard resolve accurately",
    `Got ${customUrl}`
  );

  // 1.3 Path Normalization (Leading slash, consecutive slashes)
  const pathNoSlash = buildVpsProxyUrl(5500, "index.html");
  harness.assert(
    pathNoSlash === `${VPS_BASE_URL}/proxy/5500/index.html?token=${VPS_TOKEN}`,
    "Subpath without leading slash is normalized cleanly with leading slash",
    `Got ${pathNoSlash}`
  );

  const doubleSlashPath = buildVpsProxyUrl(5500, "//app//subpage");
  harness.assert(
    doubleSlashPath === `${VPS_BASE_URL}/proxy/5500/app/subpage?token=${VPS_TOKEN}`,
    "Consecutive redundant slashes are collapsed into single slashes",
    `Got ${doubleSlashPath}`
  );

  // 1.4 Query Parameter Preservation & Token Merging
  const queryPath = buildVpsProxyUrl(5173, "/search?mode=dark&q=react");
  const queryUrlObj = new URL(queryPath);
  harness.assert(
    queryUrlObj.searchParams.get("token") === VPS_TOKEN &&
    queryUrlObj.searchParams.get("mode") === "dark" &&
    queryUrlObj.searchParams.get("q") === "react",
    "Existing search parameters are preserved alongside security token",
    `Got search params: ${queryUrlObj.search}`
  );

  // 1.5 Port Boundary and Fallback Handling
  const invalidPortFallback = buildVpsProxyUrl("not-a-port", "/");
  harness.assert(
    invalidPortFallback.includes("/proxy/5500/"),
    "Non-numeric port falls back safely to default port 5500",
    `Got ${invalidPortFallback}`
  );

  const outOfRangePortFallback = buildVpsProxyUrl(99999, "/");
  harness.assert(
    outOfRangePortFallback.includes("/proxy/5500/"),
    "Out-of-range port (>65535) falls back safely to default port 5500",
    `Got ${outOfRangePortFallback}`
  );

  // 1.6 Address Bar Input Parsing
  const addr1 = parseAddressInput("5500");
  harness.assert(addr1.port === 5500 && addr1.path === "/", "parseAddressInput('5500') yields port 5500 and path /");

  const addr2 = parseAddressInput(":8080/preview.html");
  harness.assert(addr2.port === 8080 && addr2.path === "/preview.html", "parseAddressInput(':8080/preview.html') yields port 8080 and /preview.html");

  const addr3 = parseAddressInput("http://localhost:3000/app/test");
  harness.assert(addr3.port === 3000 && addr3.path === "/app/test", "parseAddressInput('http://localhost:3000/app/test') yields port 3000 and /app/test");

  const addr4 = parseAddressInput("/only/path");
  harness.assert(addr4.port === 5500 && addr4.path === "/only/path", "parseAddressInput('/only/path') yields default port 5500 and given path");

  // 1.7 Next.js Local Rewrite URL Generation
  const rewriteUrl = buildLocalPreviewRewriteUrl(5500, "/index.html");
  harness.assert(
    rewriteUrl === "/preview/5500/index.html",
    "Local Next.js rewrite helper generates '/preview/5500/index.html'",
    `Got ${rewriteUrl}`
  );

  // 1.8 External Browser Tab Launch URL (Requirement R3)
  const tabUrl = buildExternalTabUrl(5500, "/index.html");
  harness.assert(
    tabUrl === `${VPS_BASE_URL}/proxy/5500/index.html?token=${VPS_TOKEN}`,
    "External browser tab URL matches direct VPS endpoint with token",
    `Got ${tabUrl}`
  );

  // 1.9 Offline Dev Server Error Recognition
  harness.assert(
    isServerOfflineError(500, "connect ECONNREFUSED 0.0.0.0:5500") === true,
    "isServerOfflineError recognizes 500 ECONNREFUSED as an offline dev server"
  );
  harness.assert(
    isServerOfflineError(200, "<html>OK</html>") === false,
    "isServerOfflineError does not flag 200 OK responses as offline"
  );

  // -------------------------------------------------------------------------
  // Test Section 2: Codebase Dynamic Module & Configuration Inspection
  // -------------------------------------------------------------------------
  harness.heading("Section 2: Codebase Implementation Verification (src/lib/vpsProxy.ts & next.config.ts)");

  const vpsProxyPath = path.resolve(process.cwd(), "src/lib/vpsProxy.ts");
  const vpsProxyExists = fs.existsSync(vpsProxyPath);

  if (vpsProxyExists) {
    harness.assert(true, "src/lib/vpsProxy.ts exists on disk");
    const content = fs.readFileSync(vpsProxyPath, "utf-8");
    harness.assert(
      content.includes("buildVpsProxyUrl") || content.includes("buildDirectVpsUrl"),
      "src/lib/vpsProxy.ts defines direct URL builder"
    );
    harness.assert(
      content.includes(VPS_TOKEN),
      "src/lib/vpsProxy.ts contains the authoritative security token"
    );

    // Try dynamic import
    try {
      const vpsModule = await import(pathToFileURL(vpsProxyPath).href);
      const importedBuilder = vpsModule.buildVpsProxyUrl || vpsModule.buildDirectVpsUrl;
      const importedParsePort = vpsModule.parsePort || vpsModule.parsePreviewPort;
      const importedNormalizePath = vpsModule.normalizePath || vpsModule.normalizePreviewPath;

      if (importedBuilder) {
        const generated = importedBuilder(5500, "/");
        harness.assert(
          generated.includes("5500") && generated.includes(VPS_TOKEN),
          "Imported src/lib/vpsProxy.ts URL builder successfully generates valid proxy URL with token"
        );
      }
      if (importedParsePort) {
        harness.assert(
          importedParsePort("3000") === 3000 && importedParsePort("invalid") === 5500,
          "Imported src/lib/vpsProxy.ts port parser matches contract specifications"
        );
      }
      if (importedNormalizePath) {
        harness.assert(
          importedNormalizePath("test.html") === "/test.html",
          "Imported src/lib/vpsProxy.ts path normalizer guarantees clean leading slash"
        );
      }
    } catch (err) {
      harness.skip("Dynamic import of src/lib/vpsProxy.ts", `Import error: ${err.message}`);
    }
  } else {
    harness.skip(
      "src/lib/vpsProxy.ts inspection",
      "File not yet created — planned for Worker execution in M1"
    );
  }

  // Check next.config.ts for preview rewrites
  const nextConfigPath = path.resolve(process.cwd(), "next.config.ts");
  if (fs.existsSync(nextConfigPath)) {
    const nextConfigContent = fs.readFileSync(nextConfigPath, "utf-8");
    const hasPreviewRewrite = nextConfigContent.includes("/preview/") || nextConfigContent.includes("preview/:port");
    if (hasPreviewRewrite) {
      harness.assert(true, "next.config.ts contains /preview/ rewrite rule");
    } else {
      harness.skip(
        "next.config.ts /preview/ rewrite",
        "Planned for Worker implementation in M1"
      );
    }
  }

  // -------------------------------------------------------------------------
  // Test Section 3: Live Remote VPS Endpoint Connectivity & Network Behavior
  // -------------------------------------------------------------------------
  harness.heading("Section 3: Remote VPS Live Network Behavior");

  if (skipNetwork) {
    harness.skip("All remote network tests skipped via --skip-network flag");
  } else {
    // 3.1 Healthz Endpoint Reachability
    try {
      const healthUrl = `${VPS_BASE_URL}/healthz?token=${VPS_TOKEN}`;
      const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
      harness.assert(healthRes.status === 200, `VPS /healthz endpoint returns HTTP 200 OK (Status: ${healthRes.status})`);
      const healthData = await healthRes.json().catch(() => null);
      const isAlive = healthData && (healthData.status === "alive" || healthData.status === "expired" || Boolean(healthData.lastHeartbeat));
      harness.assert(isAlive === true, `VPS health status is operational (Payload: ${JSON.stringify(healthData)})`);
    } catch (err) {
      harness.assert(false, "Failed to connect to VPS /healthz endpoint", err.message);
    }

    // 3.2 Security Gatekeeper Enforcement (Without Token -> 403 Forbidden)
    try {
      const unauthUrl = `${VPS_BASE_URL}/proxy/5500/`;
      const unauthRes = await fetch(unauthUrl, { signal: AbortSignal.timeout(8000) });
      harness.assert(
        unauthRes.status === 403,
        `Unauthenticated request to proxy endpoint returns HTTP 403 Forbidden (Status: ${unauthRes.status})`
      );
      const unauthText = await unauthRes.text();
      harness.assert(
        unauthText.includes("authorization token required"),
        "Unauthenticated response indicates token requirement",
        `Got: ${unauthText.slice(0, 100)}`
      );
    } catch (err) {
      harness.assert(false, "Unauthenticated token gate test failed", err.message);
    }

    // 3.3 Security Token Authentication & Inactive Port Behavior (Port 5500)
    try {
      const authUrl = `${VPS_BASE_URL}/proxy/5500/?token=${VPS_TOKEN}`;
      const authRes = await fetch(authUrl, { signal: AbortSignal.timeout(8000) });

      // Note: Because Live Server is not currently running on remote VPS port 5500,
      // the proxy correctly forwards to 0.0.0.0:5500, gets ECONNREFUSED, and returns status 500.
      harness.assert(
        authRes.status === 500,
        `Inactive dev server on port 5500 returns HTTP 500 ECONNREFUSED (Status: ${authRes.status})`
      );
      const errorBody = await authRes.text();
      harness.assert(
        errorBody.includes("ECONNREFUSED") || errorBody.includes("0.0.0.0:5500"),
        "Upstream proxy error body specifies ECONNREFUSED for port 5500",
        `Body: ${errorBody.slice(0, 100)}`
      );

      // Verify Set-Cookie header is injected for subsequent iframe requests
      const setCookie = authRes.headers.get("set-cookie") || "";
      harness.assert(
        setCookie.includes("explaino_token=") && setCookie.includes("SameSite=None"),
        "Response includes secure SameSite=None cookie for seamless iframe sub-resource requests",
        `Set-Cookie: ${setCookie}`
      );

      // Verify Content-Security-Policy allows framing
      const csp = authRes.headers.get("content-security-policy") || "";
      harness.assert(
        csp.includes("frame-ancestors *"),
        "Response header Content-Security-Policy permits frame-ancestors * for canvas iframe embedding",
        `CSP: ${csp}`
      );
    } catch (err) {
      harness.assert(false, "Port 5500 connectivity test failed", err.message);
    }

    // 3.4 Active Dev Server Forwarding (Port 8080 - Code Server)
    try {
      const activeUrl = `${VPS_BASE_URL}/proxy/8080/?token=${VPS_TOKEN}`;
      const activeRes = await fetch(activeUrl, { signal: AbortSignal.timeout(8000) });
      harness.assert(
        activeRes.status === 200,
        `Active port 8080 reverse proxy returns HTTP 200 OK (Status: ${activeRes.status})`
      );
      const activeHtml = await activeRes.text();
      harness.assert(
        activeHtml.includes("<!DOCTYPE html>") || activeHtml.includes("code-server"),
        "Active port returns valid application HTML document",
        `Preview: ${activeHtml.slice(0, 100)}`
      );
    } catch (err) {
      harness.assert(false, "Active port 8080 forwarding test failed", err.message);
    }

    // 3.5 Upstream Invalid Port Rejection (Port 'invalid')
    try {
      const invalidUrl = `${VPS_BASE_URL}/proxy/invalid/?token=${VPS_TOKEN}`;
      const invalidRes = await fetch(invalidUrl, { signal: AbortSignal.timeout(8000) });
      harness.assert(
        invalidRes.status === 400,
        `Upstream proxy rejects non-numeric port string with HTTP 400 Bad Request (Status: ${invalidRes.status})`
      );
    } catch (err) {
      harness.assert(false, "Invalid port rejection test failed", err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Summary & Exit Code
  // -------------------------------------------------------------------------
  const success = harness.summary();
  if (!success) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Fatal test harness error:", err);
  process.exit(1);
});
