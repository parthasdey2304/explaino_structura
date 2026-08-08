"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxFileEntry } from "@/lib/terminal/service";

interface TerminalProps {
  workspaceFiles: { path: string; name: string; content: string; language: string }[];
  onFilesChange?: (files: SandboxFileEntry[]) => void;
}

interface HistoryEntry {
  type: "input" | "output" | "error" | "system";
  text: string;
}

export default function Terminal({ workspaceFiles, onFilesChange }: TerminalProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesRef = useRef(workspaceFiles);
  filesRef.current = workspaceFiles;

  const addEntry = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => [...prev, entry]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Create sandbox session on mount
  useEffect(() => {
    const init = async () => {
      try {
        addEntry({ type: "system", text: "⏳ Connecting to sandbox..." });
        const res = await fetch("/api/terminal/create", { method: "POST" });
        const data = await res.json();
        if (data.sandboxId) {
          setSandboxId(data.sandboxId);
          setIsConnected(true);
          setHistory([]);
          addEntry({ type: "system", text: "✅ Connected to sandbox terminal" });
          addEntry({ type: "system", text: "📁 Type 'ls' to see files, 'clear' to clear screen" });
          addEntry({ type: "system", text: "⏰ Session expires after 5 minutes of inactivity" });
          addEntry({ type: "system", text: "" });
        } else {
          addEntry({ type: "error", text: "❌ Failed to create session: " + (data.error || "Unknown error") });
        }
      } catch (err) {
        addEntry({ type: "error", text: "❌ Connection failed: " + (err instanceof Error ? err.message : String(err)) });
      }
    };
    init();

    return () => {
      if (sandboxId) {
        fetch("/api/terminal/destroy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId }),
        }).catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync workspace files to sandbox (debounced, silent — no status spam).
  useEffect(() => {
    if (!sandboxId) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/terminal/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId, files: filesRef.current }),
        });
      } catch {
        // Silent fail — sandbox might be dead
      }
    }, 800);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [sandboxId, workspaceFiles]);

  // Pull the sandbox file listing back into the workspace explorer after a
  // command, so files created in the terminal show up in real time.
  const refreshFiles = useCallback(async () => {
    if (!sandboxId || !onFilesChange) return;
    try {
      const res = await fetch("/api/terminal/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId }),
      });
      const data = await res.json();
      if (Array.isArray(data.files)) {
        onFilesChange(data.files as SandboxFileEntry[]);
      }
    } catch {
      // Silent fail — non-critical
    }
  }, [sandboxId, onFilesChange]);

  const executeCommand = async (cmd: string) => {
    if (!sandboxId || !cmd.trim()) return;

    addEntry({ type: "input", text: `$ ${cmd}` });
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId, command: cmd }),
      });
      const data = await res.json();

      if (data.expired) {
        setIsConnected(false);
        addEntry({ type: "error", text: data.stderr });
        return;
      }

      if (data.stdout) {
        addEntry({ type: "output", text: data.stdout });
      }
      if (data.stderr) {
        addEntry({ type: "error", text: data.stderr });
      }
      if (!data.success && !data.stderr) {
        addEntry({ type: "error", text: "Command failed" });
      }
    } catch {
      addEntry({ type: "error", text: "Failed to execute command" });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      // Reflect any files the command created/changed into the explorer.
      refreshFiles();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.trim() === "clear") {
        setHistory([]);
      } else {
        executeCommand(input);
      }
    }
  };

  const reconnect = async () => {
    setHistory([]);
    setIsConnected(false);
    addEntry({ type: "system", text: "⏳ Reconnecting..." });
    try {
      const res = await fetch("/api/terminal/create", { method: "POST" });
      const data = await res.json();
      if (data.sandboxId) {
        setSandboxId(data.sandboxId);
        setIsConnected(true);
        setHistory([]);
        addEntry({ type: "system", text: "✅ Reconnected to sandbox terminal" });
      }
    } catch {
      addEntry({ type: "error", text: "Reconnection failed" });
    }
  };

  // Ctrl+` opens the terminal: focus the input when that shortcut fires.
  useEffect(() => {
    const handler = () => {
      inputRef.current?.focus();
    };
    window.addEventListener("explaino:focus-terminal-input", handler);
    return () => window.removeEventListener("explaino:focus-terminal-input", handler);
  }, []);

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal__history">
        {history.map((entry, i) => (
          <div key={i} className={`terminal__line terminal__line--${entry.type}`}>
            {entry.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="terminal__input-row">
        <span className="terminal__prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a command..." : "Session expired"}
          disabled={!isLoading && !isConnected}
        />
        {!isConnected && (
          <button className="terminal__reconnect" onClick={reconnect}>
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
