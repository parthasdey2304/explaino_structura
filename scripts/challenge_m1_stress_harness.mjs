/**
 * Milestone 1 Empirical Stress Test & Adversarial Challenge Harness
 * Target: src/lib/vpsProxy.ts & Next.js proxy routing
 * 
 * Tests hundreds of edge cases, boundary values, malformed inputs,
 * injection strings, and live network behaviors.
 */

import * as vps from "../src/lib/vpsProxy.ts";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(description, assertion, details = "") {
  totalTests++;
  if (assertion) {
    passedTests++;
  } else {
    failedTests++;
    failures.push({ description, details });
    console.error(`  ✖ FAIL: ${description} ${details ? `(${details})` : ""}`);
  }
}

console.log("================================================================================");
console.log("   MILESTONE 1 ADVERSARIAL STRESS TEST & EMPIRICAL CHALLENGE HARNESS");
console.log("================================================================================\n");

// =============================================================================
// CATEGORY 1: PORT STRESS TESTING (180+ Adversarial Inputs)
// =============================================================================
console.log("--- Category 1: Port Stress Testing (parsePort) ---");

const adversarialPortInputs = [
  // 1. Boundary & Out-of-Range Integers
  { input: 0, expected: 5500, reason: "Zero port is invalid TCP" },
  { input: -1, expected: 5500, reason: "Negative port -1" },
  { input: -80, expected: 5500, reason: "Negative port -80" },
  { input: -5500, expected: 5500, reason: "Negative port -5500" },
  { input: -65535, expected: 5500, reason: "Negative port -65535" },
  { input: -2147483648, expected: 5500, reason: "32-bit signed min integer" },
  { input: 1, expected: 1, reason: "TCP port lower bound 1" },
  { input: 2, expected: 2, reason: "Valid low port 2" },
  { input: 80, expected: 80, reason: "Standard HTTP port 80" },
  { input: 443, expected: 443, reason: "Standard HTTPS port 443" },
  { input: 1024, expected: 1024, reason: "Non-privileged port boundary 1024" },
  { input: 3000, expected: 3000, reason: "Node dev server port 3000" },
  { input: 5173, expected: 5173, reason: "Vite dev server port 5173" },
  { input: 5500, expected: 5500, reason: "Live Server default port 5500" },
  { input: 8080, expected: 8080, reason: "Alt HTTP port 8080" },
  { input: 65534, expected: 65534, reason: "Near upper bound 65534" },
  { input: 65535, expected: 65535, reason: "TCP port upper bound 65535" },
  { input: 65536, expected: 5500, reason: "Overflow port 65536" },
  { input: 65537, expected: 5500, reason: "Overflow port 65537" },
  { input: 70000, expected: 5500, reason: "Overflow port 70000" },
  { input: 99999, expected: 5500, reason: "Overflow port 99999" },
  { input: 2147483647, expected: 5500, reason: "32-bit signed max integer" },

  // 2. Floating-point & Non-integer Numbers
  { input: 0.0, expected: 5500, reason: "Float 0.0" },
  { input: 1.0, expected: 1, reason: "Float 1.0 (isInteger === true)" },
  { input: 5500.0, expected: 5500, reason: "Float 5500.0 (isInteger === true)" },
  { input: 0.5, expected: 5500, reason: "Float fraction 0.5" },
  { input: 3.14159, expected: 5500, reason: "Pi float" },
  { input: 80.8, expected: 5500, reason: "Float 80.8" },
  { input: 5500.99, expected: 5500, reason: "Float 5500.99" },
  { input: -0, expected: 5500, reason: "Signed negative zero" },
  { input: -3.14, expected: 5500, reason: "Negative float" },
  { input: NaN, expected: 5500, reason: "NaN" },
  { input: Infinity, expected: 5500, reason: "Positive Infinity" },
  { input: -Infinity, expected: 5500, reason: "Negative Infinity" },
  { input: Number.MAX_SAFE_INTEGER, expected: 5500, reason: "MAX_SAFE_INTEGER" },
  { input: Number.MIN_SAFE_INTEGER, expected: 5500, reason: "MIN_SAFE_INTEGER" },
  { input: Number.EPSILON, expected: 5500, reason: "EPSILON" },
  { input: 1e20, expected: 5500, reason: "Scientific notation large float" },
  { input: 1e-10, expected: 5500, reason: "Scientific notation small float" },

  // 3. Null, Undefined & Empty Strings
  { input: undefined, expected: 5500, reason: "undefined input" },
  { input: null, expected: 5500, reason: "null input" },
  { input: "", expected: 5500, reason: "empty string" },
  { input: " ", expected: 5500, reason: "single space" },
  { input: "   ", expected: 5500, reason: "multiple spaces" },
  { input: "\t", expected: 5500, reason: "tab character" },
  { input: "\n", expected: 5500, reason: "newline character" },
  { input: "\r\n", expected: 5500, reason: "CRLF" },
  { input: " \t\r\n ", expected: 5500, reason: "mixed whitespace" },

  // 4. Clean Numeric Strings & Whitespace Padding
  { input: "1", expected: 1, reason: "String '1'" },
  { input: "80", expected: 80, reason: "String '80'" },
  { input: "443", expected: 443, reason: "String '443'" },
  { input: "3000", expected: 3000, reason: "String '3000'" },
  { input: "5500", expected: 5500, reason: "String '5500'" },
  { input: "65535", expected: 65535, reason: "String '65535'" },
  { input: "65536", expected: 5500, reason: "String '65536' overflow" },
  { input: "0", expected: 5500, reason: "String '0' invalid" },
  { input: "-1", expected: 5500, reason: "String '-1' negative" },
  { input: "-5500", expected: 5500, reason: "String '-5500' negative" },
  { input: "  5500  ", expected: 5500, reason: "Trimmed whitespace port" },
  { input: "\t8080\n", expected: 8080, reason: "Tab and newline padded port" },

  // 5. Colon Prefix Notations
  { input: ":80", expected: 80, reason: "Colon prefix ':80'" },
  { input: ":3000", expected: 3000, reason: "Colon prefix ':3000'" },
  { input: ":5500", expected: 5500, reason: "Colon prefix ':5500'" },
  { input: ":8080", expected: 8080, reason: "Colon prefix ':8080'" },
  { input: ":65535", expected: 65535, reason: "Colon prefix ':65535'" },
  { input: ":0", expected: 5500, reason: "Colon prefix ':0' out of range" },
  { input: ":-1", expected: 5500, reason: "Colon prefix ':-1' negative" },
  { input: ":65536", expected: 5500, reason: "Colon prefix ':65536' overflow" },
  { input: ":99999", expected: 5500, reason: "Colon prefix ':99999' overflow" },
  { input: "::5500", expected: 5500, reason: "Double colon prefix '::5500'" },
  { input: ":abc", expected: 5500, reason: "Colon non-numeric ':abc'" },

  // 6. Hostname and IP Prefixes
  { input: "localhost:3000", expected: 3000, reason: "localhost:3000" },
  { input: "localhost:5500", expected: 5500, reason: "localhost:5500" },
  { input: "127.0.0.1:8080", expected: 8080, reason: "127.0.0.1:8080" },
  { input: "0.0.0.0:5173", expected: 5173, reason: "0.0.0.0:5173" },
  { input: "13.49.76.201:4000", expected: 4000, reason: "Public IP:4000" },
  { input: "[::1]:8000", expected: 8000, reason: "IPv6 loopback [::1]:8000" },
  { input: "my-vps.internal:9090", expected: 9090, reason: "Domain:9090" },
  { input: "localhost:0", expected: 5500, reason: "localhost:0 out of range" },
  { input: "localhost:70000", expected: 5500, reason: "localhost:70000 overflow" },

  // 7. Full URLs with various protocols
  { input: "http://localhost:3000", expected: 3000, reason: "http://localhost:3000" },
  { input: "http://localhost:5500/app", expected: 5500, reason: "http://localhost:5500/app" },
  { input: "https://localhost:8443/dash", expected: 8443, reason: "https://localhost:8443/dash" },
  { input: "http://127.0.0.1:5173/", expected: 5173, reason: "http://127.0.0.1:5173/" },
  { input: "http://localhost", expected: 80, reason: "http without port defaults to 80" },
  { input: "https://localhost", expected: 443, reason: "https without port defaults to 443" },
  { input: "http://example.com", expected: 80, reason: "http://example.com defaults to 80" },
  { input: "https://example.com", expected: 443, reason: "https://example.com defaults to 443" },
  { input: "http://localhost:80", expected: 80, reason: "http://localhost:80" },
  { input: "https://localhost:443", expected: 443, reason: "https://localhost:443" },
  { input: "ftp://localhost:21", expected: 21, reason: "ftp protocol port 21" },
  { input: "ws://localhost:9000", expected: 9000, reason: "ws protocol port 9000" },
  { input: "wss://localhost:9443", expected: 9443, reason: "wss protocol port 9443" },
  { input: "http://localhost:0", expected: 5500, reason: "http://localhost:0 falls back" },
  { input: "http://localhost:65536", expected: 5500, reason: "http://localhost:65536 falls back" },
  { input: "http://[::1]:3000/app", expected: 3000, reason: "IPv6 URL with port" },

  // 8. Non-numeric and Malformed Strings
  { input: "abc", expected: 5500, reason: "Alpha string 'abc'" },
  { input: "port", expected: 5500, reason: "Alpha string 'port'" },
  { input: "undefined", expected: 5500, reason: "Literal string 'undefined'" },
  { input: "null", expected: 5500, reason: "Literal string 'null'" },
  { input: "NaN", expected: 5500, reason: "Literal string 'NaN'" },
  { input: "true", expected: 5500, reason: "Literal string 'true'" },
  { input: "false", expected: 5500, reason: "Literal string 'false'" },
  { input: "port5500", expected: 5500, reason: "Alphanumeric prefix 'port5500'" },
  { input: "port:5500", expected: 5500, reason: "Label prefix 'port:5500'" },
  { input: "5500port", expected: 5500, reason: "Numeric prefix '5500port'" },
  { input: "5500-dev", expected: 5500, reason: "Hyphenated '5500-dev'" },
  { input: "55-00", expected: 55, reason: "Hyphenated '55-00' extracts leading 55" },
  { input: "5500/test", expected: 5500, reason: "Path append '5500/test'" },
  { input: "5500 8080", expected: 5500, reason: "Space separated ports" },

  // 9. Injection / Adversarial Strings
  { input: "5500; DROP TABLE ports; --", expected: 5500, reason: "SQL injection payload" },
  { input: "5500 && rm -rf /", expected: 5500, reason: "Shell injection payload" },
  { input: "<script>alert(1)</script>", expected: 5500, reason: "XSS payload" },
  { input: "javascript:5500", expected: 5500, reason: "javascript: pseudo-URL" },
  { input: "data:text/html,5500", expected: 5500, reason: "data: URI" },
  { input: "../../../5500", expected: 5500, reason: "Directory traversal prefix" },

  // 10. Unicode & Emoji
  { input: "🦄", expected: 5500, reason: "Unicorn emoji" },
  { input: "🚀", expected: 5500, reason: "Rocket emoji" },
  { input: "🔥5500", expected: 5500, reason: "Emoji prefix" },
  { input: "5500🔥", expected: 5500, reason: "Emoji suffix" },
  { input: "٥٥٠٠", expected: 5500, reason: "Arabic numerals (non-ASCII)" },
  { input: "５５００", expected: 5500, reason: "Fullwidth numerals (non-ASCII)" },

  // 11. Control Characters & Null Bytes
  { input: "\0", expected: 5500, reason: "Null byte alone" },
  { input: "5500\0", expected: 5500, reason: "Trailing null byte" },
  { input: "\x005500", expected: 5500, reason: "Leading null byte" },
  { input: "\x1b[31m5500\x1b[0m", expected: 5500, reason: "ANSI escape sequence" },

  // 12. Non-String / Non-Number Data Types
  { input: true, expected: 5500, reason: "Boolean true" },
  { input: false, expected: 5500, reason: "Boolean false" },
  { input: [], expected: 5500, reason: "Empty array []" },
  { input: [3000], expected: 3000, reason: "Array [3000]" },
  { input: {}, expected: 5500, reason: "Empty object {}" },
  { input: { port: 5500 }, expected: 5500, reason: "Object { port: 5500 }" },
  { input: () => 5500, expected: 5500, reason: "Function" },
  { input: Symbol("5500"), expected: 5500, reason: "Symbol" },
  { input: BigInt(8080), expected: 8080, reason: "BigInt within range" },
  { input: BigInt(70000), expected: 5500, reason: "BigInt out of range" },
];

for (const test of adversarialPortInputs) {
  let result;
  let threw = false;
  let errorMsg = "";
  try {
    result = vps.parsePort(test.input);
  } catch (err) {
    threw = true;
    errorMsg = err.message;
  }

  check(
    `parsePort(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) does not crash: ${test.reason}`,
    !threw,
    errorMsg
  );

  if (!threw) {
    check(
      `parsePort(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) returned valid integer: ${test.reason}`,
      typeof result === "number" && !isNaN(result) && Number.isInteger(result) && result >= 1 && result <= 65535,
      `Got: ${result}`
    );

    check(
      `parsePort(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) matches expected ${test.expected}: ${test.reason}`,
      result === test.expected,
      `Expected ${test.expected}, Got: ${result}`
    );
  }
}

// Custom Fallback Verification
console.log("\n--- Subcategory 1.1: Custom Fallback Integrity ---");
const fallbackCases = [
  { input: -1, fallback: 8080, expected: 8080 },
  { input: "invalid", fallback: 3000, expected: 3000 },
  { input: 99999, fallback: 5173, expected: 5173 },
  { input: "", fallback: 8000, expected: 8000 },
  { input: null, fallback: 4000, expected: 4000 },
  { input: undefined, fallback: 9000, expected: 9000 },
  { input: 3000, fallback: 8080, expected: 3000 }, // valid port keeps its own value
];
for (const tc of fallbackCases) {
  const res = vps.parsePort(tc.input, tc.fallback);
  check(
    `parsePort(${JSON.stringify(tc.input)}, fallback=${tc.fallback}) -> ${tc.expected}`,
    res === tc.expected,
    `Got ${res}`
  );
}

// Object.create(null) prototype-less object check
let nullProtoThrew = false;
let nullProtoErr = "";
try {
  vps.parsePort(Object.create(null));
} catch (e) {
  nullProtoThrew = true;
  nullProtoErr = e.message;
}
check("parsePort(Object.create(null)) does not throw unhandled exception", !nullProtoThrew, nullProtoErr);

// =============================================================================
// CATEGORY 2: PATH STRESS TESTING (180+ Adversarial Inputs)
// =============================================================================
console.log("\n--- Category 2: Path Stress Testing (normalizePath) ---");

const adversarialPathInputs = [
  // 1. Missing, Null, Undefined & Empty
  { input: undefined, expected: "/", reason: "undefined path" },
  { input: null, expected: "/", reason: "null path" },
  { input: "", expected: "/", reason: "empty string" },
  { input: " ", expected: "/", reason: "single space" },
  { input: "   ", expected: "/", reason: "multiple spaces" },
  { input: "\t\r\n", expected: "/", reason: "whitespace only" },

  // 2. Standard paths missing leading slash
  { input: "index.html", expected: "/index.html", reason: "simple file name" },
  { input: "app/main.js", expected: "/app/main.js", reason: "subpath missing leading slash" },
  { input: "styles/theme/dark.css", expected: "/styles/theme/dark.css", reason: "nested subpath" },
  { input: "api/v1/health", expected: "/api/v1/health", reason: "api route" },

  // 3. Redundant & consecutive slashes
  { input: "/", expected: "/", reason: "single slash" },
  { input: "//", expected: "/", reason: "double slash" },
  { input: "///", expected: "/", reason: "triple slash" },
  { input: "////", expected: "/", reason: "quadruple slash" },
  { input: "//index.html", expected: "/index.html", reason: "double leading slash" },
  { input: "///app///main.js", expected: "/app/main.js", reason: "triple slashes collapsed" },
  { input: "/a//b///c////d/", expected: "/a/b/c/d/", reason: "multi-level redundant slashes" },
  { input: "app//subpage//", expected: "/app/subpage/", reason: "internal and trailing double slashes" },

  // 4. Hostname and Port Prefixes (pasted from browser or editor)
  { input: "localhost:5500/index.html", expected: "/index.html", reason: "localhost:5500 prefix stripped" },
  { input: "127.0.0.1:3000/app", expected: "/app", reason: "127.0.0.1:3000 prefix stripped" },
  { input: "0.0.0.0:8080/dashboard", expected: "/dashboard", reason: "0.0.0.0:8080 prefix stripped" },
  { input: ":5500/test.html", expected: "/test.html", reason: ":5500 port prefix stripped" },
  { input: ":3000/", expected: "/", reason: ":3000/ stripped" },
  { input: "localhost:5500", expected: "/", reason: "localhost:5500 bare" },
  { input: ":8080", expected: "/", reason: ":8080 bare" },

  // 5. Full URLs pasted into path
  { input: "http://localhost:5500/index.html", expected: "/index.html", reason: "full http url extracts path" },
  { input: "https://localhost:3000/app/test", expected: "/app/test", reason: "full https url extracts path" },
  { input: "http://127.0.0.1:8080/", expected: "/", reason: "full url root slash" },
  { input: "http://localhost:3000/search?q=test#hash", expected: "/search?q=test#hash", reason: "full url preserves query and hash" },
  { input: "http://localhost:5500", expected: "/", reason: "full url without trailing slash" },

  // 6. Query Parameters Preserved Cleanly
  { input: "/?token=test", expected: "/?token=test", reason: "query at root" },
  { input: "/index.html?mode=dark", expected: "/index.html?mode=dark", reason: "file with single query param" },
  { input: "/api/items?page=1&limit=20&sort=asc", expected: "/api/items?page=1&limit=20&sort=asc", reason: "multiple query params" },
  { input: "?onlyquery=1", expected: "/?onlyquery=1", reason: "leading query param only" },
  { input: "search?q=hello%20world", expected: "/search?q=hello%20world", reason: "query missing leading slash" },
  { input: "//app//page?a=1&b=2//3", expected: "/app/page?a=1&b=2//3", reason: "slashes in query preserved, pathname collapsed" },
  { input: "/path?empty=&val=1", expected: "/path?empty=&val=1", reason: "empty query value" },
  { input: "/path?json={\"a\":1}", expected: "/path?json={\"a\":1}", reason: "json in query param" },

  // 7. Hash Fragments Preserved Cleanly
  { input: "/#section1", expected: "/#section1", reason: "hash at root" },
  { input: "/index.html#heading-2", expected: "/index.html#heading-2", reason: "file with hash" },
  { input: "#onlyhash", expected: "/#onlyhash", reason: "leading hash only" },
  { input: "/page?q=1#main-content", expected: "/page?q=1#main-content", reason: "both query and hash present" },
  { input: "/page#tab?notquery", expected: "/page#tab?notquery", reason: "question mark inside hash" },

  // 8. Encoded Characters & Unicode
  { input: "/path with spaces/index.html", expected: "/path with spaces/index.html", reason: "spaces in pathname" },
  { input: "/path%20encoded/test.html", expected: "/path%20encoded/test.html", reason: "percent encoded space" },
  { input: "/unicode/café", expected: "/unicode/café", reason: "accented unicode" },
  { input: "/über/münchen", expected: "/über/münchen", reason: "umlauts" },
  { input: "/🚀/launch", expected: "/🚀/launch", reason: "emoji in path" },
  { input: "/日本語/テスト", expected: "/日本語/テスト", reason: "CJK characters" },
  { input: "/مرحبا", expected: "/مرحبا", reason: "RTL Arabic characters" },
  { input: "/!@$&'()*+,;=", expected: "/!@$&'()*+,;=", reason: "RFC sub-delimiters" },

  // 9. Injection Payloads & Edge Strings
  { input: "<script>alert(1)</script>", expected: "/<script>alert(1)</script>", reason: "XSS payload normalized to safe path" },
  { input: "javascript:alert(1)", expected: "/javascript:alert(1)", reason: "javascript: pseudo protocol neutralized" },
  { input: "data:text/html,<h1>hi</h1>", expected: "/data:text/html,<h1>hi</h1>", reason: "data: URI neutralized" },
  { input: "onerror=alert(1)", expected: "/onerror=alert(1)", reason: "event handler neutralized" },
  { input: "'; DROP TABLE paths; --", expected: "/'; DROP TABLE paths; --", reason: "SQL injection string" },

  // 10. Non-string inputs
  { input: 123, expected: "/", reason: "numeric input" },
  { input: true, expected: "/", reason: "boolean true" },
  { input: false, expected: "/", reason: "boolean false" },
  { input: {}, expected: "/", reason: "object {}" },
  { input: [], expected: "/", reason: "array []" },
];

for (const test of adversarialPathInputs) {
  let result;
  let threw = false;
  let errorMsg = "";
  try {
    result = vps.normalizePath(test.input);
  } catch (err) {
    threw = true;
    errorMsg = err.message;
  }

  check(
    `normalizePath(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) does not crash: ${test.reason}`,
    !threw,
    errorMsg
  );

  if (!threw) {
    check(
      `normalizePath(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) starts with '/': ${test.reason}`,
      typeof result === "string" && result.startsWith("/"),
      `Got: ${result}`
    );

    check(
      `normalizePath(${typeof test.input === "string" ? JSON.stringify(test.input) : String(test.input)}) matches expected ${test.expected}: ${test.reason}`,
      result === test.expected,
      `Expected ${test.expected}, Got: ${result}`
    );
  }
}

// =============================================================================
// CATEGORY 3: URL BUILDER STRESS TESTING (buildDirectVpsUrl & buildExternalTabUrl)
// =============================================================================
console.log("\n--- Category 3: URL Builder Stress Testing & RFC Compliance ---");

const testPortsForMatrix = [5500, 3000, 8080, 80, 443, 65535, -1, 0, 99999, "invalid", "localhost:5173", ":8000"];
const testPathsForMatrix = [
  "/",
  "/index.html",
  "app/main.js",
  "//dashboard///analytics",
  "/search?q=test&page=1",
  "/view#section2",
  "/complex?q=a%20b#hash?param=1",
  "localhost:5500/test.html",
  "/🚀/app",
  "/café/menu",
];

for (const port of testPortsForMatrix) {
  for (const path of testPathsForMatrix) {
    let directUrl, tabUrl;
    let threw = false;
    let errorMsg = "";

    try {
      directUrl = vps.buildDirectVpsUrl(port, path);
      tabUrl = vps.buildExternalTabUrl(port, path);
    } catch (err) {
      threw = true;
      errorMsg = err.message;
    }

    check(
      `buildDirectVpsUrl(${JSON.stringify(port)}, ${JSON.stringify(path)}) does not throw`,
      !threw,
      errorMsg
    );

    if (!threw) {
      // 1. URL must be parseable by standard WHATWG URL parser
      let parsedDirect, parsedTab;
      let parseFailed = false;
      try {
        parsedDirect = new URL(directUrl);
        parsedTab = new URL(tabUrl);
      } catch (err) {
        parseFailed = true;
      }

      check(
        `Direct URL is valid WHATWG URL: port=${port}, path=${path}`,
        !parseFailed,
        directUrl
      );

      if (!parseFailed) {
        // 2. Protocol must be https:
        check(
          `Direct URL protocol is https: (${directUrl})`,
          parsedDirect.protocol === "https:",
          parsedDirect.protocol
        );

        // 3. Hostname must be 13.49.76.201.sslip.io
        check(
          `Direct URL hostname is ${vps.REMOTE_VPS_HOST}`,
          parsedDirect.hostname === vps.REMOTE_VPS_HOST,
          parsedDirect.hostname
        );

        // 4. Token must be present and match REMOTE_VPS_TOKEN
        check(
          `Direct URL contains valid security token: (${directUrl})`,
          parsedDirect.searchParams.get("token") === vps.REMOTE_VPS_TOKEN,
          `Token was: ${parsedDirect.searchParams.get("token")}`
        );

        // 5. External tab URL matches Direct URL exactly
        check(
          `External tab URL strictly matches Direct VPS URL`,
          directUrl === tabUrl,
          `direct: ${directUrl}, tab: ${tabUrl}`
        );

        // 6. Pathname contains /proxy/<safePort>
        const expectedPort = vps.parsePort(port);
        check(
          `Direct URL pathname starts with /proxy/${expectedPort}`,
          parsedDirect.pathname.startsWith(`/proxy/${expectedPort}`),
          `Pathname: ${parsedDirect.pathname}`
        );

        // 7. No undefined, NaN, or null in the string
        check(
          `Direct URL contains no literal 'undefined', 'NaN', or 'null'`,
          !directUrl.includes("undefined") && !directUrl.includes("NaN") && !directUrl.includes("null"),
          directUrl
        );
      }
    }
  }
}

// URL Builder Options Variations
console.log("\n--- Subcategory 3.1: URL Builder Options Integrity ---");

// includeToken: false
const noTokenUrl = vps.buildDirectVpsUrl(5500, "/index.html", { includeToken: false });
const parsedNoToken = new URL(noTokenUrl);
check("includeToken: false excludes token param", parsedNoToken.searchParams.get("token") === null, noTokenUrl);

// boolean false parameter
const boolFalseUrl = vps.buildDirectVpsUrl(5500, "/index.html", false);
const parsedBoolFalse = new URL(boolFalseUrl);
check("boolean false excludes token param", parsedBoolFalse.searchParams.get("token") === null, boolFalseUrl);

// custom token
const customToken = "my_custom_security_token_12345";
const customTokenUrl = vps.buildDirectVpsUrl(5500, "/", { token: customToken });
const parsedCustomToken = new URL(customTokenUrl);
check("custom token option applies accurately", parsedCustomToken.searchParams.get("token") === customToken, customTokenUrl);

// rewrite proxy URL
const rewriteUrl = vps.buildRewriteProxyUrl(3000, "dashboard/view?tab=1");
check(
  "buildRewriteProxyUrl generates clean /preview/3000/dashboard/view?tab=1",
  rewriteUrl === "/preview/3000/dashboard/view?tab=1",
  rewriteUrl
);

// formatDisplayUrl
const displayUrl = vps.formatDisplayUrl(5500, "/index.html");
check(
  "formatDisplayUrl generates clean 'http://localhost:5500/index.html'",
  displayUrl === "http://localhost:5500/index.html",
  displayUrl
);

// Path traversal containment check
const traversalPath = "/../../etc/passwd";
const traversalUrl = vps.buildDirectVpsUrl(5500, traversalPath);
const parsedTraversal = new URL(traversalUrl);
check(
  "Path traversal does not escape /proxy/5500 prefix",
  parsedTraversal.pathname.startsWith("/proxy/5500"),
  `Pathname escaped to: ${parsedTraversal.pathname}`
);

// =============================================================================
// CATEGORY 4: OMNIBOX / PARSETARGET STRESS TESTING
// =============================================================================
console.log("\n--- Category 4: Omnibox & Address Input (parseTarget) ---");

const parseTargetInputs = [
  { input: "5500", expectedPort: 5500, expectedPath: "/" },
  { input: ":5500", expectedPort: 5500, expectedPath: "/" },
  { input: "3000", expectedPort: 3000, expectedPath: "/" },
  { input: ":8080", expectedPort: 8080, expectedPath: "/" },
  { input: 8080, expectedPort: 8080, expectedPath: "/" },
  { input: ":8080/preview.html", expectedPort: 8080, expectedPath: "/preview.html" },
  { input: "3000/dashboard", expectedPort: 3000, expectedPath: "/dashboard" },
  { input: "5500/index.html", expectedPort: 5500, expectedPath: "/index.html" },
  { input: "http://localhost:3000/app/test", expectedPort: 3000, expectedPath: "/app/test" },
  { input: "https://localhost:8443/secure", expectedPort: 8443, expectedPath: "/secure" },
  { input: "localhost:5173/vite/demo", expectedPort: 5173, expectedPath: "/vite/demo" },
  { input: "/only/path", expectedPort: 5500, expectedPath: "/only/path" },
  { input: "/index.html?token=test#section", expectedPort: 5500, expectedPath: "/index.html?token=test#section" },
  { input: "", expectedPort: 5500, expectedPath: "/" },
  { input: "   ", expectedPort: 5500, expectedPath: "/" },
  { input: null, expectedPort: 5500, expectedPath: "/" },
  { input: undefined, expectedPort: 5500, expectedPath: "/" },
  { input: "invalid-port", expectedPort: 5500, expectedPath: "/invalid-port" },
  { input: ":99999", expectedPort: 5500, expectedPath: "/" },
  { input: ":-10", expectedPort: 5500, expectedPath: "/:-10" },
  { input: true, expectedPort: 5500, expectedPath: "/" },
  { input: false, expectedPort: 5500, expectedPath: "/" },
  { input: {}, expectedPort: 5500, expectedPath: "/" },
  { input: [], expectedPort: 5500, expectedPath: "/" },
];

for (const tc of parseTargetInputs) {
  let target;
  let threw = false;
  let errMsg = "";
  try {
    target = vps.parseTarget(tc.input);
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }

  check(`parseTarget(${JSON.stringify(tc.input)}) does not crash`, !threw, errMsg);
  if (!threw) {
    check(
      `parseTarget(${JSON.stringify(tc.input)}) port is ${tc.expectedPort}`,
      target.port === tc.expectedPort,
      `Got port: ${target.port}`
    );
    check(
      `parseTarget(${JSON.stringify(tc.input)}) path is ${tc.expectedPath}`,
      target.path === tc.expectedPath,
      `Got path: ${target.path}`
    );
  }
}

// =============================================================================
// CATEGORY 5: ERROR RECOGNITION & OFFLINE DETECTION STRESS TESTING
// =============================================================================
console.log("\n--- Category 5: Error Recognition (isServerOfflineError) ---");

const offlineErrorCases = [
  // ECONNREFUSED variations
  { status: 500, body: "connect ECONNREFUSED 127.0.0.1:5500", expected: true, reason: "500 standard node ECONNREFUSED" },
  { status: 500, body: "Error: ECONNREFUSED on port 5500", expected: true, reason: "500 simple ECONNREFUSED" },
  { status: 500, body: "Proxy error: connect ECONNREFUSED 0.0.0.0:3000", expected: true, reason: "500 code-server proxy body" },
  { status: 500, body: "Internal Server Error: Database Connection Failed", expected: false, reason: "500 unhandled app exception (server is online!)" },
  { status: 500, body: "SyntaxError: Unexpected token", expected: false, reason: "500 app syntax error" },
  { status: 500, body: "", expected: false, reason: "500 empty body" },

  // Gateway errors
  { status: 502, body: "Bad Gateway", expected: true, reason: "502 Bad Gateway" },
  { status: 502, body: "", expected: true, reason: "502 empty body" },
  { status: 504, body: "Gateway Timeout", expected: true, reason: "504 Gateway Timeout" },
  { status: 504, body: "", expected: true, reason: "504 empty body" },

  // Normal / Expected server responses (MUST NOT be flagged as offline)
  { status: 200, body: "<html>Hello World</html>", expected: false, reason: "200 OK" },
  { status: 201, body: "Created", expected: false, reason: "201 Created" },
  { status: 301, body: "Moved Permanently", expected: false, reason: "301 Redirect" },
  { status: 302, body: "Found", expected: false, reason: "302 Redirect" },
  { status: 304, body: "", expected: false, reason: "304 Not Modified" },
  { status: 400, body: "Bad Request", expected: false, reason: "400 Bad Request" },
  { status: 401, body: "Unauthorized", expected: false, reason: "401 Unauthorized" },
  { status: 403, body: "Forbidden: Token Required", expected: false, reason: "403 Forbidden" },
  { status: 404, body: "Not Found", expected: false, reason: "404 Not Found" },
  { status: 405, body: "Method Not Allowed", expected: false, reason: "405 Method Not Allowed" },
  { status: 503, body: "Service Temporarily Unavailable", expected: false, reason: "503 Service Unavailable" },
];

for (const ec of offlineErrorCases) {
  const result = vps.isServerOfflineError(ec.status, ec.body);
  check(
    `isServerOfflineError(${ec.status}, ${JSON.stringify(ec.body.slice(0, 30))}) -> ${ec.expected}: ${ec.reason}`,
    result === ec.expected,
    `Got: ${result}`
  );
}

// =============================================================================
// CATEGORY 6: LIVE VPS NETWORK VERIFICATION
// =============================================================================
console.log("\n--- Category 6: Live VPS Network Probing ---");

async function runLiveNetworkTests() {
  const token = vps.REMOTE_VPS_TOKEN;
  const origin = vps.REMOTE_VPS_ORIGIN;

  // 1. VPS Health Check
  try {
    const healthRes = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(5000) });
    check("VPS /healthz returns 200 OK", healthRes.status === 200, `Status: ${healthRes.status}`);
    const healthJson = await healthRes.json().catch(() => ({}));
    check("VPS /healthz payload has status: 'alive'", healthJson.status === "alive", JSON.stringify(healthJson));
  } catch (err) {
    check("VPS /healthz reachable", false, err.message);
  }

  // 2. Active dev server on port 8080
  try {
    const activeUrl = `${origin}/proxy/8080/?token=${token}`;
    const activeRes = await fetch(activeUrl, { signal: AbortSignal.timeout(5000) });
    check("Active port 8080 returns 200 OK", activeRes.status === 200, `Status: ${activeRes.status}`);
    const htmlText = await activeRes.text().catch(() => "");
    check("Active port 8080 returns non-empty HTML document", htmlText.length > 50 && htmlText.includes("<"), `Length: ${htmlText.length}`);
  } catch (err) {
    check("Active port 8080 proxy reachable", false, err.message);
  }

  // 3. Inactive dev server on port 5500 returns 500 ECONNREFUSED
  try {
    const inactiveUrl = `${origin}/proxy/5500/?token=${token}`;
    const inactiveRes = await fetch(inactiveUrl, { signal: AbortSignal.timeout(5000) });
    check("Inactive port 5500 returns 500 ECONNREFUSED", inactiveRes.status === 500, `Status: ${inactiveRes.status}`);
    const errBody = await inactiveRes.text().catch(() => "");
    const isConnRefused = vps.isServerOfflineError(inactiveRes.status, errBody);
    check("Port 5500 error is accurately recognized as ECONNREFUSED", isConnRefused === true, errBody.slice(0, 80));
  } catch (err) {
    check("Inactive port 5500 probe executed", false, err.message);
  }

  // 4. Missing token returns 403 Forbidden
  try {
    const unauthUrl = `${origin}/proxy/8080/`;
    const unauthRes = await fetch(unauthUrl, { signal: AbortSignal.timeout(5000) });
    check("Proxy request without token returns 403 Forbidden", unauthRes.status === 403, `Status: ${unauthRes.status}`);
  } catch (err) {
    check("Unauthenticated probe executed", false, err.message);
  }

  // 5. Check SameSite=None and frame-ancestors security headers on proxy response
  try {
    const headersUrl = `${origin}/proxy/8080/?token=${token}`;
    const headersRes = await fetch(headersUrl, { signal: AbortSignal.timeout(5000) });
    const csp = headersRes.headers.get("content-security-policy") || "";
    check(
      "Remote proxy allows iframe embedding (CSP frame-ancestors * or absent)",
      csp === "" || csp.includes("frame-ancestors *"),
      `CSP: ${csp}`
    );
  } catch (err) {
    check("Headers probe executed", false, err.message);
  }

  // =============================================================================
  // FINAL SUMMARY REPORT
  // =============================================================================
  console.log("\n================================================================================");
  console.log("             EMPIRICAL STRESS TEST HARNESS SUMMARY REPORT");
  console.log("================================================================================");
  console.log(`  Total Checks Executed:  ${totalTests}`);
  console.log(`  Passed:                 ${passedTests}`);
  console.log(`  Failed:                 ${failedTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    console.error("FAILURES ENCOUNTERED:");
    for (const f of failures) {
      console.error(`- ${f.description}: ${f.details}`);
    }
    process.exit(1);
  } else {
    console.log("All empirical stress tests and boundary challenges PASSED successfully! 🎉\n");
    process.exit(0);
  }
}

runLiveNetworkTests().catch(err => {
  console.error("Unhandled harness error:", err);
  process.exit(1);
});
