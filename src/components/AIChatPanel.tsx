"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  X,
  Send,
  Key,
  Bot,
  User,
  Loader2,
  ClipboardCheck,
  Clipboard,
  FileCode,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import type { WorkspaceFile } from "@/lib/workspace";
import {
  MISTRAL_MODELS,
  MistralError,
  chatStream,
  extractFirstCodeBlock,
  getStoredApiKey,
  getStoredModel,
  setStoredApiKey,
  setStoredModel,
  type ChatMessage,
} from "@/lib/ai/mistral";

const AI_CHAT_STORAGE_KEY = "explaino-ai-chat-history";
const MAX_STORED_MESSAGES = 100;

marked.setOptions({ breaks: true, gfm: true });

function loadChatHistory(): DisplayMessage[] {
  try {
    const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveChatHistory(messages: DisplayMessage[]) {
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota errors ignored
  }
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

export type AIWriteMode = "manual" | "ai" | "pair";

interface AIChatPanelProps {
  onClose: () => void;
  activeFile: WorkspaceFile | null;
  writeMode: AIWriteMode;
  onWriteModeChange: (mode: AIWriteMode) => void;
  /** Writes AI-generated code into the currently open file. */
  onApplyCode: (code: string) => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
}

const WRITE_MODES: { id: AIWriteMode; label: string; hint: string; icon: typeof Pencil }[] = [
  { id: "manual", label: "You write", hint: "Chat for guidance only — nothing is written for you", icon: Pencil },
  { id: "ai", label: "AI writes", hint: "Every reply's code is applied to the file automatically", icon: Sparkles },
  { id: "pair", label: "Pair", hint: "AI proposes code; review it and apply with one click", icon: Users },
];

let _msgCounter = 0;
const nextId = () => `m${++_msgCounter}-${Date.now().toString(36)}`;

const SYSTEM_PROMPT =
  "You are a concise coding assistant embedded in a browser-based code editor. " +
  "When asked to write or modify code, respond with a short explanation followed by a single fenced code block " +
  "containing the complete file content (not a diff). Prefer the language of the file the user is editing.";

export default function AIChatPanel({
  onClose,
  activeFile,
  writeMode,
  onWriteModeChange,
  onApplyCode,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadChatHistory());
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [showKeyInput, setShowKeyInput] = useState(() => !getStoredApiKey());
  const [model, setModel] = useState(() => getStoredModel());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Persist conversation so it survives panel close/reopen.
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  const saveKey = useCallback((value: string) => {
    setApiKey(value);
    setStoredApiKey(value.trim());
  }, []);

  const saveModel = useCallback((value: string) => {
    setModel(value);
    setStoredModel(value);
  }, []);

  const history = useMemo<ChatMessage[]>(() => {
    const base: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of messages) {
      if (m.role === "error") continue;
      base.push({ role: m.role, content: m.text });
    }
    return base;
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (!getStoredApiKey()) {
      setShowKeyInput(true);
      return;
    }

    const contextPrefix = activeFile
      ? `Active file: ${activeFile.name} (${activeFile.language})\n\n${activeFile.content}\n\n---\n\n`
      : "";

    const userMsg: DisplayMessage = { id: nextId(), role: "user", text };
    const assistantId = nextId();
    streamingIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "" }]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const outgoing: ChatMessage[] = [
      ...history,
      { role: "user", content: contextPrefix ? `${contextPrefix}${text}` : text },
    ];

    try {
      const full = await chatStream(
        outgoing,
        model,
        (delta) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + delta } : m))
          );
        },
        controller.signal
      );

      if (writeMode === "ai") {
        const code = extractFirstCodeBlock(full);
        if (code) onApplyCode(code);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // User-initiated stop — leave the partial reply as-is.
      } else {
        const msg = err instanceof MistralError ? err.message : "Something went wrong reaching Mistral.";
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId || m.text),
          { id: nextId(), role: "error", text: msg },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, activeFile, history, model, writeMode, onApplyCode]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyMessage = useCallback((id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    });
  }, []);

  const applyMessage = useCallback(
    (text: string) => {
      const code = extractFirstCodeBlock(text);
      if (code) onApplyCode(code);
    },
    [onApplyCode]
  );

  return (
    <div className="ai-chat-panel excalidraw-island">
      <div className="ai-chat-panel__header">
        <div className="ai-chat-panel__header-left">
          <Bot size={15} />
          <span className="ai-chat-panel__title">AI Assistant</span>
          <span className="ai-chat-panel__badge">Mistral</span>
        </div>
        <div className="ai-chat-panel__header-right">
          <button
            type="button"
            className="tool-icon-btn"
            style={{ width: "1.75rem", height: "1.75rem" }}
            onClick={() => setShowKeyInput((v) => !v)}
            title="API key & model"
          >
            <Key size={13} />
          </button>
          <button
            type="button"
            className="tool-icon-btn"
            style={{ width: "1.75rem", height: "1.75rem" }}
            onClick={onClose}
            title="Close"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Write-mode selector: who writes the code */}
      <div className="ai-chat-panel__modes">
        {WRITE_MODES.map((m) => {
          const Icon = m.icon;
          const active = writeMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`ai-chat-panel__mode${active ? " ai-chat-panel__mode--active" : ""}`}
              onClick={() => onWriteModeChange(m.id)}
              title={m.hint}
            >
              <Icon size={12} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {showKeyInput && (
        <div className="ai-chat-panel__keybox">
          <label className="ai-chat-panel__keybox-label">
            Mistral API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
              placeholder="Paste your key — stored only in this browser"
              className="ai-chat-panel__keybox-input"
              autoComplete="off"
            />
          </label>
          <label className="ai-chat-panel__keybox-label">
            Model
            <select
              value={model}
              onChange={(e) => saveModel(e.target.value)}
              className="ai-chat-panel__keybox-select"
            >
              {MISTRAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.description}
                </option>
              ))}
            </select>
          </label>
          <p className="ai-chat-panel__keybox-hint">
            Get a key at{" "}
            <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noreferrer noopener">
              console.mistral.ai/api-keys
            </a>
            . It's saved to this browser's local storage and sent only to Mistral, via this app's own
            proxy — never logged or stored server-side.
          </p>
        </div>
      )}

      <div className="ai-chat-panel__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-chat-panel__empty">
            <Bot size={22} />
            <p>Ask about your code, or request a feature — I can see the active file.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ai-chat-panel__msg ai-chat-panel__msg--${m.role}`}>
            <div className="ai-chat-panel__msg-icon">
              {m.role === "user" ? <User size={13} /> : m.role === "error" ? <X size={13} /> : <Bot size={13} />}
            </div>
            <div className="ai-chat-panel__msg-body">
              <div
                className="ai-chat-panel__msg-text ai-chat-panel__msg-text--markdown"
                dangerouslySetInnerHTML={{
                  __html: m.text
                    ? renderMarkdown(m.text)
                    : isStreaming && streamingIdRef.current === m.id
                    ? "<p><em>…</em></p>"
                    : "",
                }}
              />
              {m.role === "assistant" && m.text && (
                <div className="ai-chat-panel__msg-actions">
                  <button
                    type="button"
                    className="ai-chat-panel__msg-action"
                    onClick={() => copyMessage(m.id, m.text)}
                  >
                    {copiedId === m.id ? <ClipboardCheck size={11} /> : <Clipboard size={11} />}
                    <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                  </button>
                  {writeMode !== "ai" && extractFirstCodeBlock(m.text) && (
                    <button
                      type="button"
                      className="ai-chat-panel__msg-action ai-chat-panel__msg-action--primary"
                      onClick={() => applyMessage(m.text)}
                    >
                      <FileCode size={11} />
                      <span>Apply to file</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="ai-chat-panel__composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            activeFile ? `Ask about ${activeFile.name}…` : "Open a file, then ask me anything…"
          }
          className="ai-chat-panel__input"
          rows={2}
        />
        {isStreaming ? (
          <button type="button" className="ai-chat-panel__send ai-chat-panel__send--stop" onClick={stop}>
            <Loader2 size={14} className="ai-chat-panel__spin" />
          </button>
        ) : (
          <button
            type="button"
            className="ai-chat-panel__send"
            onClick={send}
            disabled={!input.trim()}
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
