import { Sandbox } from "e2b";

export interface TerminalResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export class TerminalService {
  private static IDLE_TIMEOUT_MS = 300_000; // 5 minutes

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

    const result = await sandbox.commands.run(command, {
      timeoutMs: 30_000,
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      success: !result.error,
    };
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

  static async syncWorkspaceToSandbox(
    sandboxId: string,
    files: { name: string; content: string; language: string }[]
  ): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(this.IDLE_TIMEOUT_MS);

    for (const file of files) {
      await sandbox.files.write(`/home/user/${file.name}`, file.content);
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
