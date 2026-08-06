"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface TerminalProps {
  workspaceFiles: { name: string; content: string; language: string }[];
}

interface HistoryEntry {
  type: "input" | "output" | "error" | "system";
  text: string;
}

export default function Terminal({ workspaceFiles }: TerminalProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Sync workspace files to sandbox
  useEffect(() => {
    if (!sandboxId || workspaceFiles.length === 0) return;

    const syncFiles = async () => {
      try {
        await fetch("/api/terminal/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId, files: workspaceFiles }),
        });
        addEntry({ type: "system", text: `📄 Synced ${workspaceFiles.length} file(s) to sandbox` });
      } catch {
        // Silent fail - sandbox might be dead
      }
    };

    syncFiles();
  }, [sandboxId, workspaceFiles]); // eslint-disable-line react-hooks/exhaustive-deps

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
