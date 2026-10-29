import { NextResponse } from "next/server";

/**
 * Unified AI Chat completions proxy for Google Gemini and Mistral AI.
 *
 * Supported Models:
 * - Gemini: Gemini 3.8 Flash, Gemini 3.5 Flash
 * - Mistral: Mistral Small, Codestral, Mistral Nemo
 */

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const DEFAULT_MISTRAL_KEY = process.env.MISTRAL_API_KEY || process.env.NEXT_PUBLIC_MISTRAL_API_KEY || "";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20000;

const SYSTEM_PROMPT =
  "You are an expert coding and canvas assistant. Provide concise, direct, copy-paste-ready code and " +
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

function mapToGeminiModel(model?: string): string {
  if (!model) return "gemini-3.8-flash";
  const m = model.toLowerCase().trim();
  if (m.includes("3.8") || m.includes("flash-3.8")) return "gemini-3.8-flash";
  if (m.includes("3.5")) return "gemini-3.5-flash";
  if (m.includes("3.1") || m.includes("lite")) return "gemini-3.1-flash-lite";
  return "gemini-3.8-flash";
}

async function callGeminiInteraction(
  apiKey: string,
  model: string,
  systemInstruction: string,
  input: string,
  stream: boolean,
  temperature?: number
): Promise<Response> {
  const upstream = await fetch(`${GEMINI_INTERACTIONS_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system_instruction: systemInstruction,
      input,
      stream,
      generation_config: {
        thinking_level: "low",
        temperature: typeof temperature === "number" ? temperature : 0.25,
      },
    }),
  });

  // Automatic failover from gemini-3.8-flash to gemini-3.5-flash on rate-limits (20 reqs/day quota)
  if ((upstream.status === 429 || upstream.status === 503) && model === "gemini-3.8-flash") {
    return callGeminiInteraction(
      apiKey,
      "gemini-3.5-flash",
      systemInstruction,
      input,
      stream,
      temperature
    );
  }

  // If 3.5-flash also hits limit, failover to 3.1-flash-lite
  if ((upstream.status === 429 || upstream.status === 503) && model === "gemini-3.5-flash") {
    return callGeminiInteraction(
      apiKey,
      "gemini-3.1-flash-lite",
      systemInstruction,
      input,
      stream,
      temperature
    );
  }

  return upstream;
}

async function callMistralChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
  temperature?: number
): Promise<Response> {
  const upstream = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: typeof temperature === "number" ? temperature : 0.3,
      stream,
    }),
  });

  // If mistral-small hits rate limit, failover to open-mistral-nemo
  if ((upstream.status === 429 || upstream.status === 503) && model.includes("small")) {
    return callMistralChat(apiKey, "open-mistral-nemo", messages, stream, temperature);
  }

  return upstream;
}

export async function POST(request: Request) {
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

  const modelStr = typeof model === "string" && model.trim() ? model.trim() : "gemini-3.8-flash";
  const isMistral = modelStr.includes("mistral") || modelStr.includes("codestral");
  const wantsStream = stream === true;

  // -------------------------------------------------------------
  // 1. Mistral Provider Execution
  // -------------------------------------------------------------
  if (isMistral) {
    const headerMistralKey = request.headers.get("x-mistral-key")?.trim();
    const mistralKey =
      headerMistralKey ||
      process.env.MISTRAL_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_MISTRAL_API_KEY?.trim() ||
      DEFAULT_MISTRAL_KEY;

    if (!mistralKey) {
      return NextResponse.json({ error: "No Mistral API key configured." }, { status: 401 });
    }

    const outgoing: ChatMessage[] =
      messages[0].role === "system"
        ? messages
        : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    let upstream: Response;
    try {
      upstream = await callMistralChat(
        mistralKey,
        modelStr,
        outgoing,
        wantsStream,
        typeof temperature === "number" ? temperature : undefined
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error reaching Mistral";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (!upstream.ok) {
      let detail = `Mistral API returned ${upstream.status}`;
      try {
        const errBody = await upstream.json();
        const msg = (errBody as { message?: string; error?: { message?: string } })?.message ??
          (errBody as { error?: { message?: string } })?.error?.message;
        if (msg) detail = msg;
      } catch {
        // upstream not json
      }
      return NextResponse.json({ error: detail }, { status: upstream.status });
    }

    if (wantsStream) {
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

  // -------------------------------------------------------------
  // 2. Google Gemini Provider Execution
  // -------------------------------------------------------------
  const headerGeminiKey = request.headers.get("x-gemini-key")?.trim();
  const geminiKey =
    headerGeminiKey ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ||
    DEFAULT_GEMINI_KEY;

  if (!geminiKey) {
    return NextResponse.json({ error: "No Gemini API key configured." }, { status: 401 });
  }

  const targetModel = mapToGeminiModel(modelStr);
  const systemMessage = messages.find((m) => m.role === "system");
  const systemInstruction = systemMessage ? systemMessage.content : SYSTEM_PROMPT;

  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const input =
    nonSystemMessages.length === 1
      ? nonSystemMessages[0].content
      : nonSystemMessages
          .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
          .join("\n\n");

  let upstream: Response;
  try {
    upstream = await callGeminiInteraction(
      geminiKey,
      targetModel,
      systemInstruction,
      input,
      wantsStream,
      typeof temperature === "number" ? temperature : undefined
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error reaching Gemini";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok) {
    let detail = `Gemini API returned ${upstream.status}`;
    try {
      const errBody = await upstream.json();
      const msg =
        (errBody as { message?: string; error?: { message?: string } })?.message ??
        (errBody as { error?: { message?: string } })?.error?.message;
      if (msg) detail = msg;
    } catch {
      // upstream not json
    }
    const status = upstream.status === 401 ? 401 : upstream.status >= 500 ? 502 : upstream.status;
    return NextResponse.json({ error: detail }, { status });
  }

  if (wantsStream && upstream.body) {
    const reader = upstream.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformedStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
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
              if (payload === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(payload);
                if (parsed.event === "content_delta") {
                  const textDelta = parsed?.delta?.text;
                  if (typeof textDelta === "string" && textDelta) {
                    const chunk = JSON.stringify({
                      choices: [{ delta: { content: textDelta } }],
                    });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  }
                }
              } catch {
                // ignore unparseable
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(transformedStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await upstream.json().catch(() => null);
  const outputStep = data?.steps?.find((s: { type: string }) => s.type === "model_output");
  const textContent = outputStep?.content?.find(
    (c: { type: string; text?: string }) => c.type === "text"
  )?.text;

  return NextResponse.json({
    id: data?.id ?? "gemini-interaction",
    choices: [
      {
        message: {
          role: "assistant",
          content: typeof textContent === "string" ? textContent : "",
        },
      },
    ],
  });
}
