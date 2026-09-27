import type { ExecutionResult } from "./types";

// Java is compiled and run remotely via Judge0 through our own server-side
// `/api/execute` proxy — the browser never contacts Judge0 directly, and the
// endpoint/credentials live in server env vars (JUDGE0_BASE_URL,
// JUDGE0_API_KEY, JUDGE0_API_HOST). No API key is needed for the default
// free CE cloud.

interface Judge0Response {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  status: { id: number; description: string };
}

function extractPublicClassName(code: string): string {
  const match = code.match(/public\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (match) return match[1];
  const anyClass = code.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  return anyClass ? anyClass[1] : "Main";
}

export async function executeJava(code: string): Promise<ExecutionResult> {
  const start = performance.now();

  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "java",
        source_code: code,
        stdin: "",
        filename: `${extractPublicClassName(code)}.java`,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Java API error (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    const data = (await res.json()) as Judge0Response;

    const stdoutLines = data.stdout ? data.stdout.split(/\r?\n/) : [];
    const stderrLines: string[] = [];

    if (data.compile_output) {
      stderrLines.push(...data.compile_output.split(/\r?\n/));
    }
    if (data.stderr) {
      stderrLines.push(...data.stderr.split(/\r?\n/));
    }
    if (data.message && data.status?.id === 13) {
      stderrLines.push(data.message);
    }

    let status: ExecutionResult["status"] = "success";
    const statusId = data.status?.id ?? 3;
    if (statusId === 5) status = "timeout";
    else if (statusId !== 3) status = "error";

    return {
      stdout: stdoutLines,
      stderr: stderrLines,
      executionTime: data.time ? Math.max(1, Math.round(parseFloat(data.time) * 1000)) : Math.round(performance.now() - start),
      language: "java",
      status,
    };
  } catch (err) {
    return {
      stdout: [],
      stderr: [
        err instanceof Error ? err.message : "Java execution failed",
        "Check your network connection — Java runs via the Judge0 cloud API.",
      ],
      executionTime: Math.round(performance.now() - start),
      language: "java",
      status: "error",
    };
  }
}
