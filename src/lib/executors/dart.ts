import type { ExecutionResult } from "./types";

// Dart is compiled and run remotely via the free Judge0 CE API (ce.judge0.com).
// No Dart SDK installation and no API key are required — the code is sent to
// Judge0's servers, compiled there, and stdout/stderr is returned.
const JUDGE0_URL = "https://ce.judge0.com/submissions?base64_encoded=false&wait=true";
const DART_LANGUAGE_ID = 90; // Dart 2.19.2

interface Judge0Response {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  status: { id: number; description: string };
}

export async function executeDart(code: string): Promise<ExecutionResult> {
  const start = performance.now();

  try {
    const res = await fetch(JUDGE0_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: DART_LANGUAGE_ID,
        stdin: "",
        cpu_time_limit: 5,
        filename: "main.dart",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Dart API error (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    const data = (await res.json()) as Judge0Response;

    const stdoutLines = data.stdout ? data.stdout.split(/\r?\n/) : [];
    const stderrLines: string[] = [];

    if (data.compile_output) {
      // Filter out Dart compiler info lines (not real errors)
      const filtered = data.compile_output.split(/\r?\n/).filter(
        (line) => line.trim() && !line.match(/^(Info:|Generated:)/)
      );
      stderrLines.push(...filtered);
    }
    if (data.stderr) {
      const filtered = data.stderr.split(/\r?\n/).filter(
        (line) => line.trim() && !line.match(/^(Info:|Generated:)/)
      );
      stderrLines.push(...filtered);
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
      language: "dart",
      status,
    };
  } catch (err) {
    return {
      stdout: [],
      stderr: [
        err instanceof Error ? err.message : "Dart execution failed",
        "Check your network connection — Dart runs via the Judge0 cloud API.",
      ],
      executionTime: Math.round(performance.now() - start),
      language: "dart",
      status: "error",
    };
  }
}
