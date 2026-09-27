"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { Bot, Check, Copy, Loader2, Mic, MicOff, Send, User, X } from "lucide-react";
import {
  MistralError,
  chatStreamAuto,
  type ChatMessage,
} from "@/lib/ai/mistral";
import { highlightCode } from "@/lib/ai/highlight";

/** Pinned model for this panel — Codestral. */
const AI_TEXT_MODEL = "codestral-latest";

/**
 * Strict scope + multi-output contract. The route only prepends its generic
 * prompt when the caller sends no system message, so this one wins: exactly
 * four complete solutions (Java, Python, C, C++), fenced for tab parsing,
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

/**
 * Tabbed solution view: one tab per fenced code block (Java/Python/C/C++
 * first), syntax-highlighted, each with its own copy-to-clipboard button.
 */
function SolutionTabs({ solutions }: { solutions: Solution[] }) {
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

/** Assistant bubble: tabbed solutions when the reply has code fences. */
function AssistantBody({ text }: { text: string }) {
  const solutions = useMemo(() => extractSolutions(text), [text]);
  if (solutions.length === 0) {
    return (
      <div
        className="ai-text-panel__msg-text ai-text-panel__msg-text--markdown"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(text || "…"),
        }}
      />
    );
  }
  return <SolutionTabs solutions={solutions} />;
}

/**
 * Right-hand AI Text sidebar: multi-line composer with voice dictation and a
 * Mistral-backed chat rendered as Markdown (code blocks syntax highlighted).
 * Slides in/out from the right edge at half the Code sidebar's width.
 */
export default function AITextSidebar({ onClose }: { onClose: () => void }) {
  const [entered, setEntered] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // Lazy init — this sidebar mounts client-side only, after a click.
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

  // Mount → slide in; close → slide out, then unmount via onClose.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Close = slide out first, then let the parent unmount us.
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

  // ── Send ───────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    stopListening();

    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", text },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setDraft("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    // Pinned model + strict 4-language system prompt (see CODE_SYSTEM_PROMPT).
    // The system message is prepended fresh every turn and never stored in
    // the conversation history.
    const history: ChatMessage[] = [
      ...convoRef.current,
      { role: "user", content: text },
    ];
    const outgoing: ChatMessage[] = [
      { role: "system", content: CODE_SYSTEM_PROMPT },
      ...history,
    ];

    try {
      const full = await chatStreamAuto(
        outgoing,
        AI_TEXT_MODEL,
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
            m.id === assistantId && !m.text ? { ...m, role: "error", text: "Stopped." } : m
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

  return (
    <aside
      className={`ai-text-panel excalidraw-island${entered ? " ai-text-panel--open" : ""}`}
      aria-label="AI Text"
    >
      <div className="ai-text-panel__header">
        <div className="ai-text-panel__header-left">
          <span className="ai-text-panel__title">AI Text</span>
          <span className="ai-text-panel__badge">Mistral</span>
        </div>
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

      <div className="ai-text-panel__messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ai-text-panel__empty">
            <Bot size={22} strokeWidth={1.8} />
            <p>Ask for code — every answer ships Java, Python, C and C++ solutions in copy-ready tabs.</p>
            <p className="ai-text-panel__empty-hint">
              Enter to send, Shift + Enter for a new line. Use the mic to dictate.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`ai-text-panel__msg ai-text-panel__msg--${m.role}`}
            >
              <div className="ai-text-panel__msg-icon">
                {m.role === "user" ? (
                  <User size={13} />
                ) : m.role === "error" ? (
                  <X size={13} />
                ) : (
                  <Bot size={13} />
                )}
              </div>
              <div className="ai-text-panel__msg-body">
                {m.role === "assistant" ? (
                  <AssistantBody text={m.text} />
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
            placeholder="Ask Mistral anything…"
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
