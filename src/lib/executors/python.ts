import type { ExecutionResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodideReady: Promise<any> | null = null;
let loadError: string | null = null;

export function isPyodideLoaded(): boolean {
  return pyodideReady !== null;
}

export function getPyodideError(): string | null {
  return loadError;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePyodide(): Promise<any> {
  if (pyodideReady) return pyodideReady;

  pyodideReady = (async () => {
    try {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";
      script.async = true;
      document.head.appendChild(script);

      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide from CDN"));
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pyodide = await (window as any).loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
      });

      return pyodide;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      loadError = message || "Failed to load Python runtime";
      pyodideReady = null;
      throw err;
    }
  })();

  return pyodideReady;
}

export async function executePython(code: string): Promise<ExecutionResult> {
  const start = performance.now();
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const pyodide = await ensurePyodide();

    pyodide.setStdout({
      batched: (text: string) => {
        stdout.push(text.trimEnd());
      },
    });

    pyodide.setStderr({
      batched: (text: string) => {
        stderr.push(text.trimEnd());
      },
    });

    await pyodide.runPythonAsync(code);

    return {
      stdout,
      stderr,
      executionTime: performance.now() - start,
      language: "python",
      status: stderr.length > 0 ? "error" : "success",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.push(message);
    return {
      stdout,
      stderr,
      executionTime: performance.now() - start,
      language: "python",
      status: "error",
    };
  }
}