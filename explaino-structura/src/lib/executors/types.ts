export interface ExecutionResult {
  stdout: string[];
  stderr: string[];
  canvasDataURL?: string;
  executionTime: number;
  language: string;
  status: "success" | "error" | "timeout";
}

export type Language = "javascript" | "python" | "html";

export interface Executor {
  execute: (code: string) => Promise<ExecutionResult>;
  language: Language;
  label: string;
  loaded: boolean;
  loadProgress?: number;
}