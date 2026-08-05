import type { ExecutionResult } from "./types";

// Java source code cannot be compiled in the browser without a backend
// compiler (there is no stable in-browser `javac`). CheerpJ only runs already-
// compiled `.jar`/`.class` bytecode, so raw source needs an external service,
// which would require an API key. We surface this clearly rather than fail
// silently.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function executeJava(_code: string): Promise<ExecutionResult> {
  return {
    stdout: [],
    stderr: [
      "Java source can't run in the browser without a backend compiler.",
      "CheerpJ (a JVM in WebAssembly) can only run compiled .jar/.class bytecode,",
      "and there is no in-browser javac. Running raw Java source would require",
      "an external compile service (an API key), which this editor avoids.",
    ],
    executionTime: 0,
    language: "java",
    status: "error",
  };
}
