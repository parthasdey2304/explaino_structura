import type { ExecutionResult, Language, Executor } from "./types";
import { executeJavaScript } from "./javascript";
import { executePython } from "./python";
import { executeHTML } from "./html";
import { executeC, executeCpp } from "./clang";
import { executeJava } from "./java";
import { executeDart } from "./dart";

const executors: Record<Language, Executor> = {
  javascript: {
    execute: executeJavaScript,
    language: "javascript",
    label: "JavaScript",
    loaded: true,
  },
  python: {
    execute: executePython,
    language: "python",
    label: "Python",
    loaded: false,
  },
  html: {
    execute: executeHTML,
    language: "html",
    label: "HTML",
    loaded: true,
  },
  c: {
    execute: executeC,
    language: "c",
    label: "C",
    loaded: false,
  },
  cpp: {
    execute: executeCpp,
    language: "cpp",
    label: "C++",
    loaded: false,
  },
  java: {
    execute: executeJava,
    language: "java",
    label: "Java",
    loaded: true,
  },
  dart: {
    execute: executeDart,
    language: "dart",
    label: "Dart",
    loaded: true,
  },
};

export async function executeCode(
  language: Language,
  code: string
): Promise<ExecutionResult> {
  const executor = executors[language];
  if (!executor) {
    return {
      stdout: [],
      stderr: [`Unsupported language: ${language}`],
      executionTime: 0,
      language,
      status: "error",
    };
  }
  return executor.execute(code);
}

export function getExecutor(language: Language): Executor | undefined {
  return executors[language];
}

export function getSupportedLanguages(): { value: Language; label: string }[] {
  return [
    { value: "javascript", label: "JavaScript" },
    { value: "python", label: "Python" },
    { value: "html", label: "HTML" },
    { value: "c", label: "C" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
    { value: "dart", label: "Dart" },
  ];
}

export function markPythonLoaded(): void {
  executors.python.loaded = true;
}

export { executePython } from "./python";
export { isClangLoaded } from "./clang";
export type { ExecutionResult, Language } from "./types";
