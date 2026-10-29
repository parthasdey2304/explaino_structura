/**
 * Multi-Provider AI Client Helper (Google Gemini & Mistral AI).
 *
 * Models supported:
 * - Gemini: Gemini 3.8 Flash, Gemini 3.5 Flash
 * - Mistral: Mistral Small, Codestral, Mistral Nemo
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIModel {
  id: string;
  label: string;
  provider: "gemini" | "mistral";
  description: string;
}

export type GeminiModel = AIModel;
export type MistralModel = AIModel;

export const ALL_MODELS: AIModel[] = [
  // Google Gemini
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "gemini",
    description: "Google's premier high-speed multimodal reasoning model",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    description: "Fast, reliable high-throughput foundational model",
  },
  // Mistral AI
  {
    id: "mistral-small-latest",
    label: "Mistral Small",
    provider: "mistral",
    description: "Fast, lightweight general reasoning model",
  },
  {
    id: "codestral-latest",
    label: "Codestral",
    provider: "mistral",
    description: "Mistral's model tuned specifically for code generation",
  },
  {
    id: "open-mistral-nemo",
    label: "Mistral Nemo",
    provider: "mistral",
    description: "High-performance multilingual and canvas text model",
  },
];

export const GEMINI_MODELS: GeminiModel[] = ALL_MODELS.filter((m) => m.provider === "gemini");
export const MISTRAL_MODELS: MistralModel[] = ALL_MODELS;

export function getModelLabel(id: string): string {
  const match = ALL_MODELS.find((m) => m.id === id);
  if (match) return match.label;
  if (id.includes("3.8")) return "Gemini 3.8 Flash";
  if (id.includes("3.5")) return "Gemini 3.5 Flash";
  if (id.includes("small")) return "Mistral Small";
  if (id.includes("codestral")) return "Codestral";
  if (id.includes("nemo")) return "Mistral Nemo";
  return id;
}

export const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
export const DEFAULT_MISTRAL_KEY = process.env.MISTRAL_API_KEY || process.env.NEXT_PUBLIC_MISTRAL_API_KEY || "";

const GEMINI_KEY_STORAGE = "explaino-gemini-api-key";
const MISTRAL_KEY_STORAGE = "explaino-mistral-api-key";
const MODEL_STORAGE = "explaino-gemini-model";

export function getStoredGeminiKey(): string {
  if (typeof window === "undefined") return DEFAULT_GEMINI_KEY;
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || DEFAULT_GEMINI_KEY;
  } catch {
    return DEFAULT_GEMINI_KEY;
  }
}

export function getStoredMistralKey(): string {
  if (typeof window === "undefined") return DEFAULT_MISTRAL_KEY;
  try {
    return window.localStorage.getItem(MISTRAL_KEY_STORAGE)?.trim() || DEFAULT_MISTRAL_KEY;
  } catch {
    return DEFAULT_MISTRAL_KEY;
  }
}

export function getStoredApiKey(): string {
  const model = getStoredModel();
  if (model.includes("mistral") || model.includes("codestral")) {
    return getStoredMistralKey();
  }
  return getStoredGeminiKey();
}

export function setStoredApiKey(key: string): void {
  try {
    if (key) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, key);
      window.localStorage.setItem(MISTRAL_KEY_STORAGE, key);
    } else {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
      window.localStorage.removeItem(MISTRAL_KEY_STORAGE);
    }
  } catch {
    // ignore quota errors
  }
}

export function getStoredModel(): string {
  if (typeof window === "undefined") return ALL_MODELS[0].id;
  try {
    const stored = window.localStorage.getItem(MODEL_STORAGE);
    if (!stored) return ALL_MODELS[0].id;
    const match = ALL_MODELS.find((m) => m.id === stored);
    if (match) return match.id;
    if (stored.includes("3.8")) return "gemini-3.8-flash";
    if (stored.includes("3.5")) return "gemini-3.5-flash";
    if (stored.includes("small")) return "mistral-small-latest";
    if (stored.includes("codestral")) return "codestral-latest";
    if (stored.includes("nemo")) return "open-mistral-nemo";
    return ALL_MODELS[0].id;
  } catch {
    return ALL_MODELS[0].id;
  }
}

export function setStoredModel(model: string): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE, model);
  } catch {
    // ignore quota errors
  }
}

export class GeminiError extends Error {}
export const MistralError = GeminiError;

/** Non-streaming chat call. Used for one-shot code generation. */
export async function chatComplete(
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const chosenModel = model || getStoredModel();
  const geminiKey = getStoredGeminiKey();
  const mistralKey = getStoredMistralKey();

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gemini-Key": geminiKey,
      "X-Mistral-Key": mistralKey,
    },
    body: JSON.stringify({ model: chosenModel, messages, stream: false }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new GeminiError(data?.error ?? `Request failed (${res.status})`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new GeminiError("AI returned an unexpected response shape.");
  }
  return content;
}

/** Open a streaming chat request. */
async function openChatStream(
  messages: ChatMessage[],
  model: string,
  signal?: AbortSignal
): Promise<Response> {
  const geminiKey = getStoredGeminiKey();
  const mistralKey = getStoredMistralKey();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Gemini-Key": geminiKey,
    "X-Mistral-Key": mistralKey,
  };

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new GeminiError(data?.error ?? `Request failed (${res.status})`);
  }
  if (!res.body) {
    throw new GeminiError("Streaming isn't supported in this environment.");
  }
  return res;
}

/** Consume an SSE chat stream, invoking `onToken` per incremental delta. */
async function readSseStream(
  res: Response,
  onToken: (delta: string) => void
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

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
        // Ignore malformed SSE chunks
      }
    }
  }

  return full;
}

/**
 * Streaming chat call that works with default or client key.
 */
export async function chatStreamAuto(
  messages: ChatMessage[],
  model?: string,
  onToken?: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const chosenModel = model || getStoredModel();
  const tokenCallback = onToken || (() => {});
  const res = await openChatStream(messages, chosenModel, signal);
  return readSseStream(res, tokenCallback);
}

/**
 * Compatibility export for chatStream
 */
export const chatStream = chatStreamAuto;

/**
 * Pull the first fenced code block out of a markdown-formatted reply, for
 * the "Apply to file" action.
 */
export function extractFirstCodeBlock(markdown: string): string | null {
  const match = markdown.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  return match ? match[1].replace(/\n$/, "") : null;
}
