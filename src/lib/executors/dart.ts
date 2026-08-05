import type { ExecutionResult } from "./types";

// Dart source requires the Dart SDK's `dart compile js` toolchain, which does
// not run in the browser. There is no in-browser runtime that can compile and
// execute arbitrary Dart source, and doing so would require an external
// backend (an API key). We surface this clearly rather than fail silently.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function executeDart(_code: string): Promise<ExecutionResult> {
  return {
    stdout: [],
    stderr: [
      "Dart source can't run in the browser without the Dart SDK.",
      "Compiling Dart (dart2js / dart compile js) requires a native toolchain",
      "that does not exist in-browser, so raw Dart source would need an external",
      "backend (an API key), which this editor avoids.",
    ],
    executionTime: 0,
    language: "dart",
    status: "error",
  };
}
