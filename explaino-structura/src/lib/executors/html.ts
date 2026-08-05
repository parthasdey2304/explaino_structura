import type { ExecutionResult } from "./types";

const TIMEOUT_MS = 5000;

export function executeHTML(code: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.cssText = "position:fixed;width:0;height:0;visibility:hidden;pointer-events:none;";
    document.body.appendChild(iframe);

    const start = performance.now();

    const timer = setTimeout(() => {
      iframe.remove();
      resolve({
        stdout: [],
        stderr: ["Execution timed out"],
        executionTime: TIMEOUT_MS,
        language: "html",
        status: "timeout",
      });
    }, TIMEOUT_MS);

    iframe.onload = () => {
      clearTimeout(timer);
      iframe.remove();
      resolve({
        stdout: [],
        stderr: [],
        executionTime: performance.now() - start,
        language: "html",
        status: "success",
      });
    };

    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif;}</style></head><body>${code}</body></html>`;
  });
}