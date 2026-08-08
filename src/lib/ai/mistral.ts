/**
 * Client-side Mistral chat helper.
 *
 * Bring-your-own-key: the user pastes their own Mistral API key into the AI
 * panel. It's kept in localStorage only (never sent anywhere but Mistral,
 * via our own /api/ai/chat proxy, and never logged there — see route.ts)
 * so nothing server-side needs to manage or bill for API usage.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MistralModel {
  id: string;
  label: string;
  description: string;
}

// A short, current curated list rather than every model Mistral hosts —
// these are the ones actually suited to a coding assistant.
export const MISTRAL_MODELS: MistralModel[] = [
  { id: "mistral-large-latest", label: "Mistral Large", description: "Strongest reasoning and code quality" },
  { id: "mistral-small-latest", label: "Mistral Small", description: "Fast and inexpensive" },
  { id: "codestral-latest", label: "Codestral", description: "Tuned specifically for code generation" },
];

const KEY_STORAGE = "explaino-mistral-api-key";
const MODEL_STORAGE = "explaino-mistral-model";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore quota errors
  }
}

export function getStoredModel(): string {
  if (typeof window === "undefined") return MISTRAL_MODELS[0].id;
  try {
    return window.localStorage.getItem(MODEL_STORAGE) ?? MISTRAL_MODELS[0].id;
  } catch {
    return MISTRAL_MODELS[0].id;
  }
}

export function setStoredModel(model: string): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE, model);
  } catch {
    // ignore quota errors
  }
}

export class MistralError extends Error {}

/** Non-streaming chat call. Used for one-shot code generation. */
export async function chatComplete(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) throw new MistralError("No Mistral API key configured.");

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mistral-Key": apiKey },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MistralError(data?.error ?? `Request failed (${res.status})`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new MistralError("Mistral returned an unexpected response shape.");
  }
  return content;
}

/**
 * Streaming chat call. Invokes `onToken` with each incremental chunk of
 * text as it arrives, so the panel can render tokens live.
 */
export async function chatStream(
  messages: ChatMessage[],
  model: string,
  onToken: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) throw new MistralError("No Mistral API key configured.");

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mistral-Key": apiKey },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new MistralError(data?.error ?? `Request failed (${res.status})`);
  }
  if (!res.body) {
    throw new MistralError("Streaming isn't supported in this environment.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Server-sent events: lines start with "data: ", one JSON chunk each,
    // terminated by a literal "data: [DONE]".
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        // Ignore malformed SSE chunks rather than aborting the whole stream.
      }
    }
  }

  return full;
}

/**
 * Pull the first fenced code block out of a markdown-formatted reply, for
 * the "Apply to file" action. Returns null when the reply has no code
 * fence (e.g. a plain explanation).
 */
export function extractFirstCodeBlock(markdown: string): string | null {
  const match = markdown.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  return match ? match[1].replace(/\n$/, "") : null;
}
