import { NextResponse } from "next/server";

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const DEFAULT_MISTRAL_KEY = process.env.MISTRAL_API_KEY || process.env.NEXT_PUBLIC_MISTRAL_API_KEY || "";

const SYSTEM_PROMPT =
  "You are a Mermaid diagram expert. Convert the user's diagram description into valid Mermaid.js diagram code.\n" +
  "CRITICAL RULES:\n" +
  "1. Output ONLY the raw Mermaid code. No markdown fences (do not write ``` or ```mermaid), no backticks.\n" +
  "2. Do NOT include conversational filler, greetings, comments, or explanations.\n" +
  "3. Choose the most appropriate diagram type: sequenceDiagram, flowchart TD/LR, classDiagram, stateDiagram-v2, or erDiagram.\n" +
  "4. Ensure node labels, arrows, and syntax are 100% valid Mermaid syntax.\n" +
  "5. In sequence diagrams, always use 'participant' (e.g. participant Client as 💻 Client) instead of 'actor' to render modern clean rectangular cards instead of stick figures.\n" +
  "6. In flowcharts with subgraphs, always declare subgraphs using an alphanumeric ID followed by a bracketed label, e.g. `subgraph Backend [\"Backend Systems\"]` or `subgraph Clients [\"Clients\"]`. Never put quotes directly after the subgraph keyword (avoid `subgraph \"Backend\"`).";

function cleanMermaidCode(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```mermaid")) {
    cleaned = cleaned.slice(10).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3).trim();
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trim();
  }
  return cleaned;
}

function getFallbackMermaid(prompt: string): string {
  const p = prompt.toLowerCase().trim();

  if (p.includes("tcp") || p.includes("handshake") || p.includes("syn")) {
    return [
      "sequenceDiagram",
      "    participant Client as 💻 Client",
      "    participant Server as 🖥️ Server",
      "    Client->>Server: SYN",
      "    Note over Server: Server receives SYN",
      "    Server->>Client: SYN-ACK",
      "    Note over Client: Client receives SYN-ACK",
      "    Client->>Server: ACK",
      "    Note over Server: Server receives ACK",
      "    Note over Client,Server: TCP connection established",
    ].join("\n");
  }

  if (
    p.includes("oauth") ||
    p.includes("auth") ||
    p.includes("login") ||
    p.includes("jwt") ||
    p.includes("token")
  ) {
    return [
      "sequenceDiagram",
      "    participant User as 👤 User",
      "    participant Client as Client App",
      "    participant Auth as Auth Server",
      "    participant API as API Server",
      "    User->>Client: Click Login",
      "    Client->>Auth: Request Authorization Code",
      "    Auth-->>User: Prompt for Credentials",
      "    User->>Auth: Provide Username & Password",
      "    Auth-->>Client: Return Auth Code",
      "    Client->>Auth: Exchange Code for Access Token",
      "    Auth-->>Client: Return Access Token",
      "    Client->>API: Request Protected Data (Bearer Token)",
      "    API-->>Client: Return Protected Resource",
    ].join("\n");
  }

  if (p.includes("git") || p.includes("branch") || p.includes("pr") || p.includes("merge")) {
    return [
      "gitGraph",
      "    commit id: \"Initial commit\"",
      "    branch feature",
      "    checkout feature",
      "    commit id: \"Implement feature\"",
      "    commit id: \"Add unit tests\"",
      "    checkout main",
      "    merge feature id: \"Squash & Merge PR\"",
      "    commit id: \"Release v1.0.0\"",
    ].join("\n");
  }

  if (
    p.includes("microservice") ||
    p.includes("system") ||
    p.includes("architecture") ||
    p.includes("backend")
  ) {
    return [
      "flowchart TD",
      "    Client[Client Browser / Mobile] --> Gateway[API Gateway]",
      "    Gateway --> Auth[Auth Service]",
      "    Gateway --> Core[Core API Service]",
      "    Gateway --> Payments[Payment Service]",
      "    Core --> DB[(Database)]",
      "    Payments --> Stripe[Payment Provider]",
      "    Auth --> Redis[(Session Cache)]",
    ].join("\n");
  }

  if (p.includes("data") || p.includes("pipeline") || p.includes("etl") || p.includes("stream")) {
    return [
      "flowchart LR",
      "    Source[(Data Sources)] --> Ingest[Ingestion Engine]",
      "    Ingest --> Queue[Message Queue]",
      "    Queue --> Stream[Stream Processor]",
      "    Stream --> Storage[(Data Lake)]",
      "    Storage --> Warehouse[(Data Warehouse)]",
      "    Warehouse --> BI[Analytics & BI]",
    ].join("\n");
  }

  if (p.includes("ecommerce") || p.includes("shop") || p.includes("checkout") || p.includes("cart")) {
    return [
      "flowchart TD",
      "    Cart[Shopping Cart] --> Checkout[Proceed to Checkout]",
      "    Checkout --> Address[Select Shipping Address]",
      "    Address --> Payment[Process Payment]",
      "    Payment --> Check{Payment Successful?}",
      "    Check -- Yes --> Confirmed[Order Confirmed & Email Sent]",
      "    Check -- No --> Retry[Display Error & Retry]",
    ].join("\n");
  }

  const title = prompt.length > 30 ? prompt.slice(0, 30) + "..." : prompt;
  return [
    "flowchart TD",
    `    Start([Start: ${title}]) --> Step1[Input / Request]`,
    "    Step1 --> Decision{Validate & Process?}",
    "    Decision -- Valid --> Step2[Execute Core Operation]",
    "    Decision -- Invalid --> Error[Return Error Response]",
    "    Step2 --> Storage[(Persist to Storage)]",
    "    Storage --> Finish([Completion / Response])",
  ].join("\n");
}

async function generateMermaidWithMistral(
  prompt: string,
  apiKey: string,
  model: string = "open-mistral-nemo"
): Promise<string | null> {
  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Generate a Mermaid diagram for: ${prompt}` },
        ],
        temperature: 0.2,
      }),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      if (typeof rawContent === "string" && rawContent.trim()) {
        return cleanMermaidCode(rawContent);
      }
    } else if (upstream.status === 429 && model.includes("small")) {
      return await generateMermaidWithMistral(prompt, apiKey, "open-mistral-nemo");
    }
  } catch {
    // network failure
  }
  return null;
}

async function generateMermaidWithGemini(
  prompt: string,
  apiKey: string,
  model: string = "gemini-3.8-flash"
): Promise<string | null> {
  try {
    const upstream = await fetch(`${GEMINI_INTERACTIONS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system_instruction: SYSTEM_PROMPT,
        input: `Generate a Mermaid diagram for: ${prompt}`,
        generation_config: {
          thinking_level: "low",
          temperature: 0.2,
        },
      }),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      const outputStep = data?.steps?.find((s: { type: string }) => s.type === "model_output");
      const text = outputStep?.content?.find((c: { type: string; text?: string }) => c.type === "text")?.text;
      if (typeof text === "string" && text.trim()) {
        return cleanMermaidCode(text);
      }
    } else if ((upstream.status === 429 || upstream.status === 503) && model === "gemini-3.8-flash") {
      return await generateMermaidWithGemini(prompt, apiKey, "gemini-3.5-flash");
    } else if ((upstream.status === 429 || upstream.status === 503) && model === "gemini-3.5-flash") {
      return await generateMermaidWithGemini(prompt, apiKey, "gemini-3.1-flash-lite");
    }
  } catch {
    // Network failure
  }
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt, model } = (body ?? {}) as { prompt?: unknown; model?: unknown };
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "\"prompt\" is required" }, { status: 400 });
  }

  const trimmedPrompt = prompt.trim();
  const requestedModel = typeof model === "string" && model.trim() ? model.trim() : "gemini-3.8-flash";
  const isMistral = requestedModel.includes("mistral") || requestedModel.includes("codestral");

  if (isMistral) {
    const headerKey = request.headers.get("x-mistral-key")?.trim();
    const apiKey =
      headerKey ||
      process.env.MISTRAL_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_MISTRAL_API_KEY?.trim() ||
      DEFAULT_MISTRAL_KEY;

    if (!apiKey) {
      const fallback = getFallbackMermaid(trimmedPrompt);
      return NextResponse.json({ mermaid: fallback, source: "template" });
    }

    const generated = await generateMermaidWithMistral(trimmedPrompt, apiKey, requestedModel);
    if (generated) {
      return NextResponse.json({ mermaid: generated, source: "ai" });
    }
  } else {
    const headerKey = request.headers.get("x-gemini-key")?.trim();
    const apiKey =
      headerKey ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ||
      DEFAULT_GEMINI_KEY;

    if (!apiKey) {
      const fallback = getFallbackMermaid(trimmedPrompt);
      return NextResponse.json({ mermaid: fallback, source: "template" });
    }

    const mappedModel = requestedModel.includes("3.5") ? "gemini-3.5-flash" : "gemini-3.8-flash";
    const generated = await generateMermaidWithGemini(trimmedPrompt, apiKey, mappedModel);
    if (generated) {
      return NextResponse.json({ mermaid: generated, source: "ai" });
    }
  }

  const fallback = getFallbackMermaid(trimmedPrompt);
  return NextResponse.json({ mermaid: fallback, source: "fallback" });
}
