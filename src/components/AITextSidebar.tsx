"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import {
  Bot,
  Check,
  Copy,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Send,
  Trash2,
  Type,
  User,
  X,
} from "lucide-react";
import {
  MistralError,
  chatStreamAuto,
  type ChatMessage,
} from "@/lib/ai/mistral";
import { highlightCode } from "@/lib/ai/highlight";

/** Pinned models for this panel. */
const CODE_MODEL = "codestral-latest";
const TEXT_MODEL = "mistral-small-latest";

/**
 * Strict scope + multi-output contract for /code requests:
 * Exactly four complete solutions (Java, Python, C, C++), fenced for tab parsing,
 * zero conversational filler.
 */
const CODE_SYSTEM_PROMPT =
  "You are Explaino Code, a programming-only assistant. Every reply must " +
  "contain exactly four complete, runnable, copy-paste-ready solutions — one " +
  "each in Java, Python, C, and C++ in that order — even if the request " +
  "names a single language or none at all. If the request is not " +
  "programming-related, answer with the closest reasonable code " +
  "interpretation across the four languages. Format: for each language, one " +
  "short bold label line, then exactly one fenced code block tagged java, " +
  "python, c, or cpp. No other code blocks. No greetings, introductions, or " +
  "conversational filler — at most one terse line per solution.";

/**
 * Direct plain text system prompt for /text requests:
 * No code tabs, no multi-solution wrappers, direct plain text/data/ASCII output.
 */
const TEXT_SYSTEM_PROMPT =
  "You are Explaino Text, a concise, direct, text-only assistant. " +
  "You provide clean, direct plain text responses without any conversational filler, chit-chat, introductions, or pleasantries. " +
  "Never output code tabs, never format with multiple language tabs, and do not wrap your answer in code blocks unless specifically requested. " +
  "Output directly the requested text, lists, ASCII values, or data tables cleanly.";

// LocalStorage cache key and 7-day retention limit
const STORAGE_KEY = "explaino_ai_text_history_v1";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Isolated Marked instance so this sidebar's code blocks can be syntax
// highlighted without changing how other panels render Markdown.
const md = new Marked({ breaks: true, gfm: true });
md.use({
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const language = (lang ?? "").trim().split(/[\s,;]+/)[0] ?? "";
      const safeLang = language.replace(/[^a-z0-9+#_-]/gi, "").toLowerCase();
      return (
        `<pre class="ai-text__pre"><code class="language-${safeLang}">` +
        `${highlightCode(text, language)}</code></pre>`
      );
    },
  },
});

function renderMarkdown(text: string): string {
  const html = md.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

// ── Speech recognition (webkitSpeechRecognition / SpeechRecognition) ──────
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  results: ArrayLike<SpeechResult>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function createSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recog = new Ctor();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = "en-US";
  return recog;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  timestamp?: number;
  mode?: "code" | "text";
}

let msgCounter = 0;
const nextId = () => `at${++msgCounter}-${Date.now().toString(36)}`;

interface Solution {
  lang: string;
  label: string;
  code: string;
}

const CANONICAL_ORDER = ["java", "python", "c", "cpp"];

function solutionLabel(lang: string, index: number): string {
  const key = lang.toLowerCase();
  if (key === "java") return "Java";
  if (key === "python") return "Python";
  if (key === "c") return "C";
  if (key === "cpp" || key === "c++" || key === "cxx") return "C++";
  if (key) return lang.length <= 12 ? lang.toUpperCase() : `Solution ${index + 1}`;
  return `Solution ${index + 1}`;
}

/** Pull every fenced code block out of a reply for the tabbed solution view. */
function extractSolutions(markdown: string): Solution[] {
  const out: Solution[] = [];
  const fence = /```([a-zA-Z0-9_+#-]+)?[^\S\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = fence.exec(markdown)) !== null) {
    index++;
    const lang = (match[1] ?? "").trim();
    out.push({
      lang,
      label: solutionLabel(lang, index),
      code: match[2].replace(/\n$/, ""),
    });
  }
  // Canonical language order first (Java/Python/C/C++), extras in place.
  const rank = (s: Solution) => {
    const i = CANONICAL_ORDER.indexOf(s.lang.toLowerCase());
    return i === -1 ? CANONICAL_ORDER.length : i;
  };
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function loadCachedMessages(): UiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - ONE_WEEK_MS;
    return list.filter(
      (m: any) =>
        m &&
        typeof m.id === "string" &&
        typeof m.text === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "error") &&
        (!m.timestamp || m.timestamp >= cutoff)
    );
  } catch (err) {
    console.warn("Failed to load AI text history:", err);
    return [];
  }
}

function saveCachedMessages(messages: UiMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const cutoff = Date.now() - ONE_WEEK_MS;
    const toSave = messages
      .filter((m) => !m.timestamp || m.timestamp >= cutoff)
      .slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn("Failed to save AI text history:", err);
  }
}

/**
 * Tabbed solution view: one tab per fenced code block (Java/Python/C/C++
 * first), syntax-highlighted, with copy button and add-to-canvas button.
 */
function SolutionTabs({
  solutions,
  onInsertCode,
}: {
  solutions: Solution[];
  onInsertCode?: (code: string, lang: string) => void;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const current = solutions[Math.min(active, solutions.length - 1)];

  const onCopy = useCallback(async () => {
    const ok = await copyText(current.code);
    if (!ok) return;
    const index = solutions.indexOf(current);
    setCopied(index);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }, [current, solutions]);

  return (
    <div className="ai-text__solutions">
      <div className="ai-text__tabbar" role="tablist" aria-label="Solutions">
        {solutions.map((s, i) => (
          <button
            key={`${s.label}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === Math.min(active, solutions.length - 1)}
            className={`ai-text__tab${i === Math.min(active, solutions.length - 1) ? " ai-text__tab--active" : ""}`}
            onClick={() => setActive(i)}
            title={s.label}
          >
            {s.label}
          </button>
        ))}
        <span className="ai-text__count">
          {solutions.length} solution{solutions.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="ai-text__codewrap">
        <div className="ai-text__code-actions">
          {onInsertCode && (
            <button
              type="button"
              className="ai-text__canvas-btn"
              onClick={() => onInsertCode(current.code, current.lang)}
              title="Add syntax-highlighted code card to canvas"
              aria-label={`Add ${current.label} code to canvas`}
            >
              <Plus size={13} strokeWidth={2.2} />
              <span>Add to Canvas</span>
            </button>
          )}
          <button
            type="button"
            className="ai-text__copy"
            onClick={onCopy}
            title="Copy solution to clipboard"
            aria-label={`Copy ${current.label} solution`}
          >
            {copied === solutions.indexOf(current) ? (
              <Check size={13} strokeWidth={2.5} />
            ) : (
              <Copy size={13} strokeWidth={2.2} />
            )}
            <span>{copied === solutions.indexOf(current) ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <pre className="ai-text__pre">
          <code
            className={`language-${current.lang}`}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                highlightCode(current.code, current.lang)
              ),
            }}
          />
        </pre>
      </div>
    </div>
  );
}

/** Assistant bubble: tabbed solutions when code, or direct text with Add to Canvas. */
function AssistantBody({
  text,
  mode,
  onInsertCode,
  onInsertText,
}: {
  text: string;
  mode?: "code" | "text";
  onInsertCode?: (code: string, lang: string) => void;
  onInsertText?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const solutions = useMemo(() => {
    if (mode === "text") return [];
    return extractSolutions(text);
  }, [text, mode]);

  if (solutions.length === 0) {
    return (
      <div className="ai-text-panel__msg-body-inner">
        <div
          className="ai-text-panel__msg-text ai-text-panel__msg-text--markdown"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(text || "…"),
          }}
        />
        {text && (
          <div className="ai-text__actions-row">
            {onInsertText && (
              <button
                type="button"
                className="ai-text__canvas-btn"
                onClick={() => onInsertText(text)}
                title="Add text to canvas (Excalidraw Text tool T / 8)"
              >
                <Type size={12} strokeWidth={2.2} />
                <span>Add to Canvas (T)</span>
              </button>
            )}
            <button
              type="button"
              className="ai-text__canvas-btn"
              onClick={handleCopy}
              title="Copy text"
            >
              {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.2} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return <SolutionTabs solutions={solutions} onInsertCode={onInsertCode} />;
}

export interface AITextSidebarProps {
  onClose: () => void;
  onInsertCode?: (code: string, lang: string) => void;
  onInsertText?: (text: string) => void;
}

/**
 * Right-hand AI Text sidebar: multi-line composer with voice dictation,
 * Codestral (/code) vs Mistral Small (/text) routing, 1-week LocalStorage chat
 * persistence, user message actions (Copy & Edit/Modify), and canvas insertion.
 */
export default function AITextSidebar({
  onClose,
  onInsertCode,
  onInsertText,
}: AITextSidebarProps) {
  const [entered, setEntered] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>(() => loadCachedMessages());
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedUserMsgId, setCopiedUserMsgId] = useState<string | null>(null);

  const [speechSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  });

  const convoRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listenBaseRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize convoRef from cached messages
  useEffect(() => {
    const valid = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }))
      .slice(-12);
    convoRef.current = valid;
  }, []);

  // Save messages to LocalStorage
  useEffect(() => {
    if (messages.length > 0) {
      saveCachedMessages(messages);
    }
  }, [messages]);

  // Mount → slide in; close → slide out, then unmount via onClose.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = useCallback(() => {
    setEntered(false);
    recognitionRef.current?.stop();
    window.setTimeout(() => onClose(), 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    convoRef.current = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // ── Voice input ────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!speechSupported) return;
    const recog = createSpeechRecognition();
    if (!recog) return;
    recognitionRef.current = recog;
    const base = draft.trim();
    listenBaseRef.current = base ? `${base} ` : "";
    let finalTranscript = "";

    recog.onresult = (event) => {
      let interim = "";
      for (let i = event.results.length - 1; i >= 0; i--) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      setDraft(listenBaseRef.current + finalTranscript + interim);
    };
    recog.onerror = () => setIsListening(false);
    recog.onend = () => setIsListening(false);
    recog.start();
    setIsListening(true);
  }, [speechSupported, draft]);

  // ── User action handlers ─────────────────────────────────────────────────
  const handleCopyUserPrompt = useCallback(async (id: string, text: string) => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopiedUserMsgId(id);
    if (userCopyTimer.current) clearTimeout(userCopyTimer.current);
    userCopyTimer.current = setTimeout(() => setCopiedUserMsgId(null), 1500);
  }, []);

  const handleEditUserPrompt = useCallback((text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const raw = draft.trim();
    if (!raw || isStreaming) return;
    stopListening();

    const isTextMode = /\/text\b/i.test(raw);
    const mode: "code" | "text" = isTextMode ? "text" : "code";
    const modelToUse = isTextMode ? TEXT_MODEL : CODE_MODEL;
    const systemPromptToUse = isTextMode ? TEXT_SYSTEM_PROMPT : CODE_SYSTEM_PROMPT;

    // Strip /code or /text token for clean prompt sent to model
    const cleanPrompt =
      raw.replace(/(?:^|\s)\/(?:text|code)(?:\s|$)/gi, " ").trim() || raw;

    const assistantId = nextId();
    const now = Date.now();
    const userMsg: UiMessage = {
      id: nextId(),
      role: "user",
      text: raw,
      timestamp: now,
      mode,
    };
    const assistantMsg: UiMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      timestamp: now,
      mode,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setDraft("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history: ChatMessage[] = [
      ...convoRef.current,
      { role: "user", content: cleanPrompt },
    ];
    const outgoing: ChatMessage[] = [
      { role: "system", content: systemPromptToUse },
      ...history,
    ];

    try {
      const full = await chatStreamAuto(
        outgoing,
        modelToUse,
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + delta } : m
            )
          );
        },
        controller.signal
      );
      convoRef.current = [...history, { role: "assistant", content: full }];
      if (convoRef.current.length > 24) convoRef.current = convoRef.current.slice(-24);
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.text
              ? { ...m, role: "error", text: "Stopped." }
              : m
          )
        );
      } else {
        const msg =
          err instanceof MistralError || err instanceof Error
            ? err.message
            : "Request failed.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, role: "error", text: msg } : m))
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [draft, isStreaming, stopListening]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    stopListening();
  }, [stopListening]);

  const isDraftText = /\/text\b/i.test(draft);

  return (
    <aside
      className={`ai-text-panel excalidraw-island${entered ? " ai-text-panel--open" : ""}`}
      aria-label="AI Text"
    >
      <div className="ai-text-panel__header">
        <div className="ai-text-panel__header-left">
          <span className="ai-text-panel__title">AI Text</span>
          <span className="ai-text-panel__badge">
            {isDraftText ? "Mistral Small (/text)" : "Codestral (/code)"}
          </span>
        </div>
        <div className="ai-text-panel__header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="ai-text-panel__header-btn"
              onClick={clearHistory}
              title="Clear chat history"
              aria-label="Clear chat history"
            >
              <Trash2 size={13} strokeWidth={2.2} />
            </button>
          )}
          <button
            type="button"
            className="ai-text-panel__close"
            onClick={close}
            title="Close"
            aria-label="Close AI Text"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="ai-text-panel__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ai-text-panel__empty">
            <Bot size={22} strokeWidth={1.8} />
            <p>
              Use <strong>/code</strong> for Codestral tabbed solutions (Java, Python, C, C++).
            </p>
            <p>
              Use <strong>/text</strong> for Mistral Small direct text output with canvas insertion (T).
            </p>
            <p className="ai-text-panel__empty-hint">
              Enter to send, Shift + Enter for newline. Use mic for dictation.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`ai-text-panel__msg ai-text-panel__msg--${m.role}`}
            >
              {m.role === "user" ? (
                <div className="ai-text-panel__msg-left">
                  <div className="ai-text-panel__msg-icon" title="You">
                    <User size={13} />
                  </div>
                  <button
                    type="button"
                    className="ai-text__user-circle-btn"
                    onClick={() => handleCopyUserPrompt(m.id, m.text)}
                    title="Copy prompt"
                    aria-label="Copy prompt"
                  >
                    {copiedUserMsgId === m.id ? (
                      <Check size={12} strokeWidth={2.5} />
                    ) : (
                      <Copy size={12} strokeWidth={2.2} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ai-text__user-circle-btn"
                    onClick={() => handleEditUserPrompt(m.text)}
                    title="Edit and modify prompt"
                    aria-label="Edit and modify prompt"
                  >
                    <Pencil size={12} strokeWidth={2.2} />
                  </button>
                </div>
              ) : (
                <div className="ai-text-panel__msg-icon">
                  {m.role === "error" ? <X size={13} /> : <Bot size={13} />}
                </div>
              )}
              <div className="ai-text-panel__msg-body">
                {m.role === "assistant" ? (
                  <AssistantBody
                    text={m.text}
                    mode={m.mode}
                    onInsertCode={onInsertCode}
                    onInsertText={onInsertText}
                  />
                ) : (
                  <div className="ai-text-panel__msg-text">{m.text}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ai-text-panel__composer">
        <div className="ai-text-panel__input-row">
          <button
            type="button"
            className={`ai-text-panel__mic${isListening ? " ai-text-panel__mic--active" : ""}`}
            onClick={isListening ? stopListening : startListening}
            disabled={!speechSupported}
            title={
              speechSupported
                ? isListening
                  ? "Stop recording"
                  : "Voice input"
                : "Voice input isn't supported in this browser"
            }
          >
            {isListening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
          <textarea
            ref={inputRef}
            className="ai-text-panel__input"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type /code or /text (e.g. /text list ASCII values)…"
            aria-label="Message"
          />
          {isStreaming ? (
            <button
              type="button"
              className="ai-text-panel__send ai-text-panel__send--stop"
              onClick={stop}
              title="Stop"
            >
              <Loader2 size={14} className="ai-text-panel__spin" />
            </button>
          ) : (
            <button
              type="button"
              className="ai-text-panel__send"
              onClick={send}
              disabled={!draft.trim()}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
