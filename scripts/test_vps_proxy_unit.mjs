import * as vps from "../src/lib/vpsProxy.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`✖ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✔ PASS: ${message}`);
}

console.log("Running VPS Proxy Unit Tests...\n");

// 1. parsePort tests
assert(vps.parsePort() === 5500, "parsePort() defaults to 5500");
assert(vps.parsePort(null) === 5500, "parsePort(null) defaults to 5500");
assert(vps.parsePort("") === 5500, "parsePort('') defaults to 5500");
assert(vps.parsePort(0) === 5500, "parsePort(0) defaults to 5500");
assert(vps.parsePort(-10) === 5500, "parsePort(-10) defaults to 5500");
assert(vps.parsePort(65536) === 5500, "parsePort(65536) defaults to 5500");
assert(vps.parsePort(80) === 80, "parsePort(80) is 80");
assert(vps.parsePort(443) === 443, "parsePort(443) is 443");
assert(vps.parsePort("3000") === 3000, "parsePort('3000') is 3000");
assert(vps.parsePort(":5500") === 5500, "parsePort(':5500') is 5500");
assert(vps.parsePort("localhost:5173") === 5173, "parsePort('localhost:5173') is 5173");
assert(vps.parsePort("http://localhost:3000/app") === 3000, "parsePort full http URL");
assert(vps.parsePort("https://test.local:8080/path") === 8080, "parsePort full https with port");
assert(vps.parsePort("http://test.local/path") === 80, "parsePort full http defaults to 80");
assert(vps.parsePort("https://test.local/path") === 443, "parsePort full https defaults to 443");
assert(vps.parsePort("invalid") === 5500, "parsePort invalid string");
assert(vps.parsePort("99999") === 5500, "parsePort 99999 string");

// 2. normalizePath tests
assert(vps.normalizePath() === "/", "normalizePath() defaults to /");
assert(vps.normalizePath(null) === "/", "normalizePath(null) defaults to /");
assert(vps.normalizePath("") === "/", "normalizePath('') defaults to /");
assert(vps.normalizePath("   ") === "/", "normalizePath('   ') defaults to /");
assert(vps.normalizePath("index.html") === "/index.html", "normalizePath('index.html') is /index.html");
assert(vps.normalizePath("//app//subpage") === "/app/subpage", "normalizePath collapses consecutive slashes");
assert(vps.normalizePath("///a///b///c") === "/a/b/c", "normalizePath multi-collapse");
assert(vps.normalizePath("localhost:5500/app") === "/app", "normalizePath strips localhost prefix");
assert(vps.normalizePath(":5500/test") === "/test", "normalizePath strips port prefix");
assert(vps.normalizePath("http://localhost:3000/foo?bar=1#baz") === "/foo?bar=1#baz", "normalizePath preserves query and hash");
assert(vps.normalizePath("/search?mode=dark&q=react") === "/search?mode=dark&q=react", "normalizePath search params preserved");

// 3. parseTarget tests
const t1 = vps.parseTarget("5500");
assert(t1.port === 5500 && t1.path === "/", "parseTarget('5500')");
const t2 = vps.parseTarget(":8080/preview.html");
assert(t2.port === 8080 && t2.path === "/preview.html", "parseTarget(':8080/preview.html')");
const t3 = vps.parseTarget("http://localhost:3000/app/test");
assert(t3.port === 3000 && t3.path === "/app/test", "parseTarget('http://localhost:3000/app/test')");
const t4 = vps.parseTarget("/only/path");
assert(t4.port === 5500 && t4.path === "/only/path", "parseTarget('/only/path')");
const t5 = vps.parseTarget("");
assert(t5.port === 5500 && t5.path === "/", "parseTarget empty");
const t6 = vps.parseTarget(3000);
assert(t6.port === 3000 && t6.path === "/", "parseTarget numeric");

// 4. URL builders
assert(vps.buildDirectVpsUrl() === "https://13.49.76.201.sslip.io/proxy/5500/?token=" + vps.REMOTE_VPS_TOKEN, "buildDirectVpsUrl default");
assert(vps.buildDirectVpsUrl(3000, "/dashboard") === "https://13.49.76.201.sslip.io/proxy/3000/dashboard?token=" + vps.REMOTE_VPS_TOKEN, "buildDirectVpsUrl custom");
assert(vps.buildDirectVpsUrl(5500, "/", false) === "https://13.49.76.201.sslip.io/proxy/5500/", "buildDirectVpsUrl false excludes token");
assert(vps.buildDirectVpsUrl(5500, "/", { includeToken: false }) === "https://13.49.76.201.sslip.io/proxy/5500/", "buildDirectVpsUrl includeToken: false");
assert(vps.buildRewriteProxyUrl(5500, "/index.html") === "/preview/5500/index.html", "buildRewriteProxyUrl");
assert(vps.buildExternalTabUrl(5500, "/index.html") === "https://13.49.76.201.sslip.io/proxy/5500/index.html?token=" + vps.REMOTE_VPS_TOKEN, "buildExternalTabUrl");
assert(vps.formatDisplayUrl(5500, "/index.html") === "http://localhost:5500/index.html", "formatDisplayUrl");

// 5. Offline error detection
assert(vps.isServerOfflineError(500, "connect ECONNREFUSED 0.0.0.0:5500") === true, "isServerOfflineError 500 ECONNREFUSED");
assert(vps.isServerOfflineError(502) === true, "isServerOfflineError 502");
assert(vps.isServerOfflineError(504) === true, "isServerOfflineError 504");
assert(vps.isServerOfflineError(200) === false, "isServerOfflineError 200 is false");
assert(vps.isServerOfflineError(404) === false, "isServerOfflineError 404 is false");

console.log("\nAll 35 unit assertions PASSED successfully!\n");
