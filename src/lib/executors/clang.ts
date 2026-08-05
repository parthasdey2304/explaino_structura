import type { ExecutionResult } from "./types";

// browsercc compiles C/C++ to WebAssembly entirely in the browser (no server,
// no API key) using Clang/LLVM compiled to WASM. It exposes `compile()`, which
// returns a promise with a WebAssembly.Module, and we run that module ourselves
// with @bjorn3/browser_wasi_shim so stdout/stderr are captured cleanly.
//
// Both libraries are loaded at runtime as ES modules from a CDN, so the heavy
// compiler binaries (~100MB) are never bundled into our app.

const BROWSERCC_URL =
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/index.js";
const WASI_SHIM_URL =
  "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cachedModules: Record<string, any> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadingModules: Record<string, Promise<any>> = {};
let ready = false;

export function isClangLoaded(): boolean {
  return ready;
}

// Load an ES module from a URL by injecting a <script type="module">. This
// bypasses the bundler (Turbopack) so remote imports work at runtime and the
// module's own `import.meta.url` stays pointed at the CDN for its assets.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadCdnModule(url: string): Promise<any> {
  if (url in cachedModules) return Promise.resolve(cachedModules[url]);
  if (url in loadingModules) return loadingModules[url];

  loadingModules[url] = new Promise((resolve, reject) => {
    const valueKey = `__cdn_mod_${Math.random().toString(36).slice(2)}`;
    const readyKey = `${valueKey}_ready`;

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `import * as m from ${JSON.stringify(url)}; window[${JSON.stringify(valueKey)}] = m; window[${JSON.stringify(readyKey)}]();`;
    script.onerror = () => reject(new Error("Failed to load module: " + url));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    win[readyKey] = () => {
      cachedModules[url] = win[valueKey];
      script.remove();
      delete win[valueKey];
      delete win[readyKey];
      resolve(cachedModules[url]);
    };

    document.head.appendChild(script);
  });

  return loadingModules[url];
}

async function getCompiler(): Promise<void> {
  if (ready) return;
  const [browsercc, wasiShim] = await Promise.all([
    loadCdnModule(BROWSERCC_URL),
    loadCdnModule(WASI_SHIM_URL),
  ]);
  cachedModules.browsercc = browsercc;
  cachedModules.wasiShim = wasiShim;
  ready = true;
}

async function runClang(
  code: string,
  language: "c" | "cpp"
): Promise<ExecutionResult> {
  const start = performance.now();
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    await getCompiler();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browsercc: any = cachedModules.browsercc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasiShim: any = cachedModules.wasiShim;

    const fileName = language === "c" ? "main.c" : "main.cpp";
    // browsercc always drives clang++ (C++), so we compile both C and C++ with
    // the C++ front-end (plain C programs using stdio compile fine). We force
    // -fno-exceptions to avoid unresolved __cxa_throw/exception-link symbols.
    const flags = ["-fno-exceptions", "-std=c++17", "-O1"];

    const { module, compileOutput } = await browsercc.compile({
      source: code,
      fileName,
      flags,
    });

    if (!module) {
      stderr.push(
        compileOutput
          ? compileOutput.trim()
          : "Compilation failed (no output)."
      );
      return {
        stdout,
        stderr,
        executionTime: performance.now() - start,
        language,
        status: "error",
      };
    }

    const decoder = new TextDecoder();
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const fds = [
      new wasiShim.OpenFile(new wasiShim.File(new TextEncoder().encode(""))),
      new wasiShim.ConsoleStdout((data: Uint8Array) => {
        stdoutLines.push(decoder.decode(data));
      }),
      new wasiShim.ConsoleStdout((data: Uint8Array) => {
        stderrLines.push(decoder.decode(data));
      }),
    ];

    const wasi = new wasiShim.WASI([], [], fds);
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    try {
      wasi.start(instance);
    } catch (exitErr) {
      // Program exit via WASIProcExit throws; stdout/stderr are still valid.
      const exitMessage =
        exitErr instanceof Error ? exitErr.message : String(exitErr);
      if (!/process exited/.test(exitMessage)) {
        stderrLines.push(exitMessage);
      }
    }

    const outText = stdoutLines.join("").trim();
    const errText = stderrLines.join("").trim();
    if (outText) stdout.push(outText);
    if (errText) stderr.push(errText);

    return {
      stdout,
      stderr,
      executionTime: performance.now() - start,
      language,
      status: stderr.length > 0 ? "error" : "success",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.push(message);
    return {
      stdout,
      stderr,
      executionTime: performance.now() - start,
      language,
      status: "error",
    };
  }
}

export function executeC(code: string): Promise<ExecutionResult> {
  return runClang(code, "c");
}

export function executeCpp(code: string): Promise<ExecutionResult> {
  return runClang(code, "cpp");
}
