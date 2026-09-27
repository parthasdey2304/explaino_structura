import { NextResponse } from "next/server";

/**
 * Judge0 code-execution proxy (server-side only — no client-side leak).
 *
 * The browser never talks to Judge0 directly. Both the endpoint and any
 * credentials come strictly from server environment variables:
 *   - `JUDGE0_BASE_URL` — Judge0 instance base URL. Defaults to the free
 *     public CE cloud (https://ce.judge0.com); point it at a self-hosted
 *     VPS instance to run privately.
 *   - `JUDGE0_API_KEY` — optional. Only sent when `JUDGE0_API_HOST` is set,
 *     as the RapidAPI `X-RapidAPI-Key` header. The stock CE cloud and
 *     self-hosted instances need no key.
 *   - `JUDGE0_API_HOST` — optional RapidAPI host (e.g.
 *     judge0-ce.p.rapidapi.com). Setting it switches the request into
 *     RapidAPI mode (key + host headers against JUDGE0_BASE_URL).
 *
 * None of these are prefixed with NEXT_PUBLIC_/VITE_, so Next.js never
 * inlines them into the client bundle — they only exist in this handler.
 */

const DEFAULT_BASE_URL = "https://ce.judge0.com";
const MAX_SOURCE_CHARS = 100_000;
const MAX_STDIN_CHARS = 10_000;

// Judge0 language ids. The allowlist is deliberately small: only runtimes
// the editor actually executes remotely (Java, Dart). Everything else runs
// locally in the browser (JS, Pyodide, WASM clang) or needs no runner (HTML).
const LANGUAGE_IDS: Record<string, number> = {
  java: 62, // Java 11
  dart: 90, // Dart 2.19.2
};

interface ExecuteBody {
  language?: unknown;
  source_code?: unknown;
  stdin?: unknown;
  filename?: unknown;
}

export async function POST(request: Request) {
  let body: ExecuteBody;
  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const language = typeof body.language === "string" ? body.language : "";
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return NextResponse.json(
      {
        error: `"language" must be one of: ${Object.keys(LANGUAGE_IDS).join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (typeof body.source_code !== "string" || !body.source_code) {
    return NextResponse.json(
      { error: "\"source_code\" must be a non-empty string" },
      { status: 400 }
    );
  }
  if (body.source_code.length > MAX_SOURCE_CHARS) {
    return NextResponse.json(
      { error: `Source too large (max ${MAX_SOURCE_CHARS} chars)` },
      { status: 413 }
    );
  }
  const stdin = typeof body.stdin === "string" ? body.stdin : "";
  if (stdin.length > MAX_STDIN_CHARS) {
    return NextResponse.json(
      { error: `stdin too large (max ${MAX_STDIN_CHARS} chars)` },
      { status: 413 }
    );
  }
  const filename =
    typeof body.filename === "string" && body.filename
      ? body.filename.slice(0, 128)
      : "Main";

  const base = (process.env.JUDGE0_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const apiHost = process.env.JUDGE0_API_HOST?.trim();
  const apiKey = process.env.JUDGE0_API_KEY?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiHost) {
    if (!apiKey) {
      return NextResponse.json(
        { error: "JUDGE0_API_HOST is set but JUDGE0_API_KEY is missing" },
        { status: 500 }
      );
    }
    headers["X-RapidAPI-Key"] = apiKey;
    headers["X-RapidAPI-Host"] = apiHost;
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${base}/submissions?base64_encoded=false&wait=true`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          source_code: body.source_code,
          language_id: languageId,
          stdin,
          cpu_time_limit: 5,
          filename,
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error reaching Judge0";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Judge0 API error (HTTP ${upstream.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      },
      { status: upstream.status >= 500 ? 502 : upstream.status }
    );
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data);
}
