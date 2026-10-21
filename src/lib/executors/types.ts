/**
 * @file types.ts
 * @description Type definitions and interfaces for code execution engines in Explaino Structura.
 * Supports multiple language runtimes including WebAssembly, sandbox execution, and in-browser interpreters.
 *
 * @version 1.1.0
 */

/**
 * Encapsulates the complete result of running a code snippet in any supported language executor.
 */
export interface ExecutionResult {
  /** Array of standard output lines captured during code execution. */
  stdout: string[];
  /** Array of standard error lines or stack traces captured during code execution. */
  stderr: string[];
  /** Optional base64 data URL representing an image or HTML5 canvas drawn by the program. */
  canvasDataURL?: string;
  /** Wall-clock execution duration in milliseconds. */
  executionTime: number;
  /** Identifier of the language runtime that processed the execution. */
  language: string;
  /** Final execution status flag indicating success, runtime/compile error, or execution timeout. */
  status: "success" | "error" | "timeout";
}

/**
 * Union of supported programming languages available for in-editor execution.
 */
export type Language =
  | "javascript"
  | "python"
  | "html"
  | "c"
  | "cpp"
  | "java"
  | "dart";

/**
 * Interface contract implemented by each specific language execution service.
 */
export interface Executor {
  /**
   * Executes source code string in the respective runtime environment.
   *
   * @param code - The raw source code to execute.
   * @returns A promise resolving to the structured ExecutionResult.
   */
  execute: (code: string) => Promise<ExecutionResult>;
  /** The target programming language for this executor. */
  language: Language;
  /** Human-readable display name for the language (e.g. "Python 3", "JavaScript"). */
  label: string;
  /** Whether the runtime environment (Wasm binary, CDN script, or worker) is initialized. */
  loaded: boolean;
  /** Optional numerical download or initialization progress percentage (0-100). */
  loadProgress?: number;
}
