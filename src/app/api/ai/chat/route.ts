import { NextResponse } from "next/server";

/**
 * Mistral chat-completions proxy.
 *
 * Bring-your-own-key: the caller's Mistral API key travels in the
 * `X-Mistral-Key` request header for this single request only. It is never
 * logged, stored, or written to any datastore on this server — it's read
 * once, forwarded to Mistral, and discarded when the response is returned.
 * The key lives in the browser's localStorage (see src/lib/ai/mistral.ts),
 * so each user supplies and owns their own key rather than sharing a
 * server-side secret.
 */

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20000;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.role === "system" || v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string"
  );
}

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-mistral-key")?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing Mistral API key. Add one in the AI panel's settings." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { model, messages, temperature, stream } = (body ?? {}) as {
    model?: unknown;
    messages?: unknown;
    temperature?: unknown;
    stream?: unknown;
  };

  if (typeof model !== "string" || !model) {
    return NextResponse.json({ error: "\"model\" is required" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    return NextResponse.json(
      { error: "\"messages\" must be a non-empty array of { role, content }" },
      { status: 400 }
    );
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Too many messages (max ${MAX_MESSAGES}). Start a new conversation.` },
      { status: 400 }
    );
  }
  for (const m of messages) {
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `A message exceeds the ${MAX_MESSAGE_CHARS}-character limit.` },
        { status: 400 }
      );
    }
  }

  const wantsStream = stream === true;

  let upstream: Response;
  try {
    upstream = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof temperature === "number" ? temperature : 0.3,
        stream: wantsStream,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error reaching Mistral";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok) {
    let detail = `Mistral API returned ${upstream.status}`;
    try {
      const errBody = await upstream.json();
      const msg = (errBody as { message?: string; error?: { message?: string } })?.message
        ?? (errBody as { error?: { message?: string } })?.error?.message;
      if (msg) detail = msg;
    } catch {
      // upstream didn't return JSON — keep the generic status message
    }
    const status = upstream.status === 401 ? 401 : upstream.status >= 500 ? 502 : upstream.status;
    return NextResponse.json({ error: detail }, { status });
  }

  if (wantsStream) {
    // Pass the SSE stream straight through; the client parses `data:` lines
    // itself (see mistral.ts). No buffering here so tokens can render as
    // they arrive.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
