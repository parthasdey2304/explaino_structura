/**
 * Remote VPS Reverse Proxy & Web Preview Routing Utility
 * Project: Explaino Structura
 * 
 * Provides URL construction, port/path parsing, security token management,
 * and health checking for remote VPS web preview (e.g. Live Server on port 5500).
 */

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------
export const DEFAULT_PREVIEW_PORT = 5500;
export const DEFAULT_DEV_SERVER_PORT = DEFAULT_PREVIEW_PORT;

export const REMOTE_VPS_HOST = "13.49.76.201.sslip.io";
export const VPS_HOST = REMOTE_VPS_HOST;

export const REMOTE_VPS_TOKEN = "explaino_sec_8b41915d25547e2edd553bab03ea4cbd";
export const VPS_TOKEN = REMOTE_VPS_TOKEN;
export const VPS_AUTH_TOKEN = REMOTE_VPS_TOKEN;
export const VPS_SECURE_TOKEN = REMOTE_VPS_TOKEN;

export const REMOTE_VPS_ORIGIN = `https://${REMOTE_VPS_HOST}`;
export const VPS_ORIGIN = REMOTE_VPS_ORIGIN;
export const VPS_BASE_URL = REMOTE_VPS_ORIGIN;

export const DEFAULT_PREVIEW_PATH = "/";
export const DEFAULT_DEV_SERVER_PATH = DEFAULT_PREVIEW_PATH;

export const PREVIEW_REWRITE_PREFIX = "/preview";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------
export interface PreviewTarget {
  port: number;
  path: string;
}
export type VpsProxyTarget = PreviewTarget;

export interface UrlBuildOptions {
  includeToken?: boolean;
  token?: string;
  baseUrl?: string;
  mode?: "direct" | "rewrite";
}
export type BuildUrlOptions = UrlBuildOptions;

export interface PortHealthResult {
  port: number;
  isOnline: boolean;
  statusCode: number;
  statusText?: string;
  isConnectionRefused?: boolean;
  error?: string;
  latencyMs?: number;
}
export type PortHealthStatus = PortHealthResult;

// ---------------------------------------------------------------------------
// Port Parsing & Validation
// ---------------------------------------------------------------------------
/**
 * Validates and parses an arbitrary port input into a valid TCP port (1-65535).
 * Falls back to defaultPort (5500) if omitted, empty, invalid, or out of range.
 */
export function parsePort(
  rawPort?: unknown,
  fallback: number = DEFAULT_PREVIEW_PORT
): number {
  if (rawPort === undefined || rawPort === null || rawPort === "") {
    return fallback;
  }
  if (typeof rawPort === "number") {
    return Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
      ? rawPort
      : fallback;
  }

  // Safely coerce to string without crashing on prototype-less objects (e.g. Object.create(null))
  let raw: string;
  try {
    raw = String(rawPort).trim();
  } catch {
    return fallback;
  }
  if (!raw) return fallback;

  // Handle full URL inputs: e.g. "http://localhost:3000/app", "http://localhost:0"
  if (raw.includes("://")) {
    try {
      const parsedUrl = new URL(raw);
      if (parsedUrl.port !== "") {
        const p = parseInt(parsedUrl.port, 10);
        return p >= 1 && p <= 65535 ? p : fallback;
      }
      if (parsedUrl.protocol === "http:") return 80;
      if (parsedUrl.protocol === "https:") return 443;
      if (parsedUrl.protocol === "ftp:") return 21;
      if (parsedUrl.protocol === "ws:") return 80;
      if (parsedUrl.protocol === "wss:") return 443;
    } catch {
      // Fall through to regex extraction
    }
  }

  // Handle IPv6 bracketed hosts: e.g. "[::1]:8000", "[::1]"
  const ipv6Match = raw.match(/\[[^\]]+\](?::(\d+))?/);
  if (ipv6Match) {
    if (ipv6Match[1]) {
      const p = parseInt(ipv6Match[1], 10);
      return p >= 1 && p <= 65535 ? p : fallback;
    }
    return fallback;
  }

  // Handle colon-prefixed or host:port strings: e.g. ":5500", "localhost:5500", "127.0.0.1:3000", "::5500"
  const colonMatch = raw.match(/:(\d+)(?:[/?#]|$)/);
  if (colonMatch) {
    const p = parseInt(colonMatch[1], 10);
    return p >= 1 && p <= 65535 ? p : fallback;
  }

  // Handle direct numeric strings: e.g. "5500", "3000", "55-00"
  const directMatch = raw.match(/^(\d+)/);
  if (directMatch) {
    const p = parseInt(directMatch[1], 10);
    return p >= 1 && p <= 65535 ? p : fallback;
  }

  return fallback;
}

export const parsePreviewPort = parsePort;
export const normalizePort = parsePort;

// ---------------------------------------------------------------------------
// Path Normalization
// ---------------------------------------------------------------------------
/**
 * Normalizes an arbitrary path or URL fragment into a clean path starting with "/".
 * Preserves query strings (?query=1) and hash fragments (#section).
 * Collapses duplicate consecutive slashes in the pathname portion.
 * Resolves dot segments (.. / .) to prevent directory traversal escaping root.
 */
export function normalizePath(rawPath?: unknown): string {
  if (!rawPath || typeof rawPath !== "string") {
    return DEFAULT_PREVIEW_PATH;
  }

  let clean = rawPath.trim();
  if (!clean) {
    return DEFAULT_PREVIEW_PATH;
  }

  // Handle full URL inputs if passed: extract pathname + search + hash
  if (clean.includes("://")) {
    try {
      const parsedUrl = new URL(clean);
      return (parsedUrl.pathname || "/") + parsedUrl.search + parsedUrl.hash;
    } catch {
      // Fall through to cleanup
    }
  }

  // Strip host/port prefixes if user pasted "localhost:5500/index.html", ":5500/index.html", "[::1]:8000/app"
  clean = clean.replace(
    /^(?:https?:\/\/)?(?:\[[0-9a-f:.]+\]|localhost|127\.0\.0\.1|0\.0\.0\.0)?(?::\d+)?/i,
    ""
  );

  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }

  // Separate pathname portion from search (?...) and hash (#...)
  const match = clean.match(/^([^?#]*)([?#].*)?$/);
  const rawPathname = match?.[1] ?? clean;
  const suffix = match?.[2] ?? "";

  // Normalize consecutive slashes and resolve dot segments in pathname portion
  const segments = rawPathname.split("/");
  const resolvedSegments: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
    } else {
      resolvedSegments.push(seg);
    }
  }

  let normalizedPathname = "/" + resolvedSegments.join("/");
  if (rawPathname.endsWith("/") && !normalizedPathname.endsWith("/")) {
    normalizedPathname += "/";
  }

  return normalizedPathname + suffix;
}

export const normalizePreviewPath = normalizePath;

// ---------------------------------------------------------------------------
// Target Parsing (Omnibox Input)
// ---------------------------------------------------------------------------
/**
 * Parses user address bar omnibox input into a structured target object { port, path }.
 * Supports:
 *   "5500"                       -> { port: 5500, path: "/" }
 *   "5500/index.html"            -> { port: 5500, path: "/index.html" }
 *   "3000/dashboard"             -> { port: 3000, path: "/dashboard" }
 *   ":8080/preview.html"         -> { port: 8080, path: "/preview.html" }
 *   "http://localhost:3000/app"  -> { port: 3000, path: "/app" }
 *   "/only/path"                 -> { port: 5500, path: "/only/path" }
 */
export function parseTarget(
  input?: unknown,
  defaultPort: number = DEFAULT_PREVIEW_PORT
): PreviewTarget {
  if (input === undefined || input === null) {
    return { port: defaultPort, path: DEFAULT_PREVIEW_PATH };
  }

  if (typeof input === "number") {
    return {
      port: parsePort(input, defaultPort),
      path: DEFAULT_PREVIEW_PATH,
    };
  }

  if (typeof input !== "string") {
    return { port: defaultPort, path: DEFAULT_PREVIEW_PATH };
  }

  const text = input.trim();
  if (!text) {
    return { port: defaultPort, path: DEFAULT_PREVIEW_PATH };
  }

  // Pure port number input (e.g. "5500", ":5500", "  :3000  ", ":99999")
  if (/^\s*:?\d+\s*$/.test(text)) {
    return {
      port: parsePort(text, defaultPort),
      path: DEFAULT_PREVIEW_PATH,
    };
  }

  // Path-only starting with slash (e.g. "/index.html", "/app/test?q=1")
  if (text.startsWith("/")) {
    return {
      port: defaultPort,
      path: normalizePath(text),
    };
  }

  // Bare port with path or colon-port with path: e.g. "5500/index.html", "3000/dashboard", ":8080/preview.html"
  const portWithPathMatch = text.match(/^:?(\d{1,5})(\/.*)?$/);
  if (portWithPathMatch) {
    const p = parseInt(portWithPathMatch[1], 10);
    if (p >= 1 && p <= 65535) {
      return {
        port: p,
        path: normalizePath(portWithPathMatch[2] || "/"),
      };
    }
  }

  // General fallback: full URLs (http://localhost:3000/app), host:port (localhost:5173/vite/demo), or invalid strings
  const port = parsePort(text, defaultPort);
  const path = normalizePath(text);

  return { port, path };
}

export const parseAddressInput = parseTarget;
export const parsePreviewInput = parseTarget;

// ---------------------------------------------------------------------------
// URL Builders
// ---------------------------------------------------------------------------
/**
 * Builds the canonical direct HTTPS URL to the remote VPS reverse proxy with token authentication.
 * Used for in-canvas iframe and external browser tab launch.
 *
 * Example: buildDirectVpsUrl(5500, "/index.html")
 * -> "https://13.49.76.201.sslip.io/proxy/5500/index.html?token=explaino_sec_..."
 */
export function buildDirectVpsUrl(
  port: number | string = DEFAULT_PREVIEW_PORT,
  path: string = DEFAULT_PREVIEW_PATH,
  options?: UrlBuildOptions | boolean
): string {
  const safePort = parsePort(port, DEFAULT_PREVIEW_PORT);
  const safePath = normalizePath(path);

  const includeToken =
    typeof options === "boolean" ? options : options?.includeToken ?? true;
  const token =
    typeof options === "object" && options?.token
      ? options.token
      : REMOTE_VPS_TOKEN;
  const baseUrl =
    typeof options === "object" && options?.baseUrl
      ? options.baseUrl
      : REMOTE_VPS_ORIGIN;

  const prefix = `/proxy/${safePort}`;
  const url = new URL(`${baseUrl}${prefix}${safePath}`);

  // Guarantee that pathname cannot escape the /proxy/${safePort} prefix
  if (!url.pathname.startsWith(prefix)) {
    url.pathname = `${prefix}${url.pathname.startsWith("/") ? "" : "/"}${url.pathname}`;
  }

  if (includeToken && token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export const buildVpsProxyUrl = buildDirectVpsUrl;

/**
 * Builds the local same-origin preview URL proxied via Next.js rewrites.
 *
 * Example: buildRewriteProxyUrl(5500, "/index.html")
 * -> "/preview/5500/index.html"
 */
export function buildRewriteProxyUrl(
  port: number | string = DEFAULT_PREVIEW_PORT,
  path: string = DEFAULT_PREVIEW_PATH,
  _options?: UrlBuildOptions
): string {
  void _options;
  const safePort = parsePort(port, DEFAULT_PREVIEW_PORT);
  const safePath = normalizePath(path);
  return `${PREVIEW_REWRITE_PREFIX}/${safePort}${safePath}`;
}

export const buildLocalPreviewRewriteUrl = buildRewriteProxyUrl;
export const buildLocalPreviewUrl = buildRewriteProxyUrl;

/**
 * Builds the external tab URL for opening the web application in a new browser tab (Requirement R3).
 * Always resolves to the direct secure HTTPS URL.
 */
export function buildExternalTabUrl(
  port: number | string = DEFAULT_PREVIEW_PORT,
  path: string = DEFAULT_PREVIEW_PATH,
  options?: UrlBuildOptions | boolean
): string {
  return buildDirectVpsUrl(port, path, options);
}

/**
 * Formats a clean, readable display URL for the minimalist address bar omnibox.
 * Example: "http://localhost:5500/index.html"
 */
export function formatDisplayUrl(
  port: number | string = DEFAULT_PREVIEW_PORT,
  path: string = DEFAULT_PREVIEW_PATH
): string {
  const safePort = parsePort(port, DEFAULT_PREVIEW_PORT);
  const safePath = normalizePath(path);
  return `http://localhost:${safePort}${safePath}`;
}

/**
 * Builds the iframe URL according to chosen routing mode ("direct" vs "rewrite").
 */
export function buildIframeUrl(options?: UrlBuildOptions & { port?: number | string; path?: string }): string {
  const mode = options?.mode ?? "direct";
  const port = options?.port ?? DEFAULT_PREVIEW_PORT;
  const path = options?.path ?? DEFAULT_PREVIEW_PATH;

  if (mode === "rewrite") {
    return buildRewriteProxyUrl(port, path, options);
  }
  return buildDirectVpsUrl(port, path, options);
}

// ---------------------------------------------------------------------------
// Error Recognition & Server Health Probing
// ---------------------------------------------------------------------------
/**
 * Helper to determine if an HTTP response represents an offline dev server
 * (ECONNREFUSED returned by upstream code-server proxy).
 */
export function isServerOfflineError(
  status: number,
  bodyText: string = ""
): boolean {
  if (
    status === 500 &&
    (bodyText.includes("ECONNREFUSED") ||
      bodyText.includes("connect ECONNREFUSED"))
  ) {
    return true;
  }
  if (status === 502 || status === 504) {
    return true;
  }
  return false;
}

export const isConnectionRefusedError = isServerOfflineError;

/**
 * Probes connectivity to the target port via server-side Next.js route handler
 * (/api/preview-health?port=<port>) to bypass browser cross-origin CORS limitations.
 */
export async function checkVpsPortHealth(
  portInput?: number | string | null,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<PortHealthResult> {
  const port = parsePort(portInput, DEFAULT_PREVIEW_PORT);
  const timeoutMs = options?.timeoutMs ?? 6000;
  const start =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let fetchSignal: AbortSignal = controller.signal;
  if (options?.signal) {
    if (typeof AbortSignal.any === "function") {
      fetchSignal = AbortSignal.any([controller.signal, options.signal]);
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      fetchSignal = controller.signal;
    }
  }

  try {
    const res = await fetch(`/api/preview-health?port=${port}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: fetchSignal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        start
    );

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.isOnline === "boolean") {
        return {
          port,
          isOnline: data.isOnline,
          statusCode: data.statusCode ?? res.status,
          statusText: data.statusText,
          isConnectionRefused: data.isConnectionRefused ?? false,
          error: data.error,
          latencyMs,
        };
      }
    }

    return {
      port,
      isOnline: false,
      statusCode: res.status,
      statusText: res.statusText,
      error: `Health endpoint returned status ${res.status}`,
      isConnectionRefused: false,
      latencyMs,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        start
    );
    const message =
      err instanceof Error ? err.message : "Health check probe failed";

    return {
      port,
      isOnline: false,
      statusCode: 504,
      statusText: "Gateway Timeout",
      error: message,
      isConnectionRefused: false,
      latencyMs,
    };
  }
}
