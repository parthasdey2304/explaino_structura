import { NextResponse } from "next/server";

/**
 * Mistral chat-completions proxy (server-side only — no client-side leak).
 *
 * Key resolution order:
 *   1. `X-Mistral-Key` request header — optional bring-your-own-key override;
 *      read once, forwarded to Mistral, never logged or stored.
 *   2. `process.env.MISTRAL_API_KEY` — the server secret. It is NOT prefixed
 *      with NEXT_PUBLIC_/VITE_, so Next.js never inlines it into the client
 *      bundle; it only ever exists in this Route Handler.
 *
 * Every request also gets the assistant system prompt below prepended (unless
 * the caller already sent a system message), so replies stay concise.
 */

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20000;

const SYSTEM_PROMPT =
  "You are an expert coding assistant. Provide concise, direct, copy-paste-ready code and " +
  "solutions. Eliminate conversational filler, pleasantries, or verbose introductions unless " +
  "specifically requested.";

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
  const headerKey = request.headers.get("x-mistral-key")?.trim();
  const apiKey = headerKey || process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No Mistral API key. Set MISTRAL_API_KEY in the server environment " +
          "(Vercel Project Settings) or add one in the AI panel's settings.",
      },
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

  // Prepend the coding-assistant system prompt unless the caller supplied one.
  const outgoing: ChatMessage[] =
    messages[0].role === "system"
      ? messages
      : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

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
        messages: outgoing,
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
