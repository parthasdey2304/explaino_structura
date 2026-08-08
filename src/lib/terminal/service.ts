import {
  Sandbox,
  CommandExitError,
  FileType,
  type CommandResult,
} from "e2b";

export interface TerminalResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface SandboxFileEntry {
  /** Path relative to the workspace root (/home/user), posix separators. */
  path: string;
  content: string;
}

export interface WorkspaceSyncFile {
  /** Path relative to the workspace root, e.g. "src/main.js". */
  path: string;
  name: string;
  content: string;
  language: string;
}

export class TerminalService {
  private static IDLE_TIMEOUT_MS = 300_000; // 5 minutes

  // Sandboxes where `apt-get update` has already run, so installs don't fail
  // with "Unable to locate package" (apt exit status 100).
  private static aptUpdated = new Set<string>();

  // Directories that should never be pulled into the workspace explorer.
  private static readonly SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    ".cache",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "target",
    ".idea",
    ".vscode",
  ]);

  private static readonly MAX_FILE_BYTES = 512 * 1024;
  private static readonly MAX_FILES = 200;

  static async createSession(): Promise<string> {
    const sandbox = await Sandbox.create({
      timeoutMs: this.IDLE_TIMEOUT_MS,
    });
    return sandbox.sandboxId;
  }

  static async executeCommand(
    sandboxId: string,
    command: string
  ): Promise<TerminalResult> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);

    // Make apt usable out of the box: run `apt-get update` once before the
    // first apt install/update/upgrade, otherwise installs fail with
    // exit status 100 ("Unable to locate package").
    const trimmed = command.trim();
    const isAptCommand =
      /^(sudo\s+)?apt(-get)?\s+(install|update|upgrade|dist-upgrade|autoremove|remove)\b/.test(
        trimmed
      );
    if (isAptCommand && !this.aptUpdated.has(sandboxId)) {
      this.aptUpdated.add(sandboxId);
      try {
        await sandbox.commands.run("apt-get update -y", {
          timeoutMs: 120_000,
        });
      } catch {
        // Non-fatal — still attempt the user's command below.
      }
    }

    try {
      const result = await sandbox.commands.run(command, {
        timeoutMs: 30_000,
      });
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        success: result.exitCode === 0,
      };
    } catch (err) {
      // Commands that exit non-zero throw CommandExitError carrying output.
      if (err instanceof CommandExitError) {
        const r = err as CommandResult;
        return {
          stdout: r.stdout || "",
          stderr: r.stderr || "",
          success: r.exitCode === 0,
        };
      }
      throw err;
    }
  }

  static async writeFile(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);
    await sandbox.files.write(path, content);
  }

  static async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);
    return await sandbox.files.read(path);
  }

  static async listFiles(
    sandboxId: string,
    dir: string = "/home/user"
  ): Promise<string[]> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);
    const files = await sandbox.files.list(dir);
    return files.map((f) => f.name);
  }

  /**
   * Recursively list all text files under the workspace dir, returning paths
   * relative to it. Binary files (null bytes), large files and build/junk
   * directories are skipped so the explorer stays clean.
   */
  static async listWorkspaceFiles(
    sandboxId: string,
    dir: string = "/home/user"
  ): Promise<SandboxFileEntry[]> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);
    const out: SandboxFileEntry[] = [];

    const walk = async (currentDir: string, rel: string) => {
      if (out.length >= this.MAX_FILES) return;
      let entries: Awaited<ReturnType<typeof sandbox.files.list>>;
      try {
        entries = await sandbox.files.list(currentDir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= this.MAX_FILES) break;
        if (entry.type === FileType.SYMLINK) continue;
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.type === FileType.DIR) {
          if (this.SKIP_DIRS.has(entry.name)) continue;
          await walk(`${currentDir}/${entry.name}`, relPath);
        } else if (entry.type === FileType.FILE) {
          if (entry.size > this.MAX_FILE_BYTES) continue;
          try {
            const bytes = await sandbox.files.read(
              `${currentDir}/${entry.name}`,
              { format: "bytes" }
            );
            if (bytes.includes(0)) continue;
            out.push({
              path: relPath,
              content: new TextDecoder().decode(bytes),
            });
          } catch {
            // Skip unreadable files.
          }
        }
      }
    };

    await walk(dir, "");
    return out;
  }

  static async syncWorkspaceToSandbox(
    sandboxId: string,
    files: WorkspaceSyncFile[]
  ): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);

    for (const file of files) {
      const target = `/home/user/${file.path}`;
      try {
        await sandbox.files.write(target, file.content);
      } catch {
        // Ignore individual write failures so one bad path can't break the
        // whole sync.
      }
    }
  }

  static async destroySession(sandboxId: string): Promise<void> {
    try {
      const sandbox = await Sandbox.connect(sandboxId);
      await sandbox.kill();
    } catch {
      // Sandbox may already be dead
    }
  }
}
