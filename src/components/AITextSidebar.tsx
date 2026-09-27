"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { Bot, Loader2, Mic, MicOff, Send, User, X } from "lucide-react";
import {
  MistralError,
  chatStreamAuto,
  getStoredModel,
  type ChatMessage,
} from "@/lib/ai/mistral";
import { highlightCode } from "@/lib/ai/highlight";

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
    const outgoing: ChatMessage[] = [
      ...convoRef.current,
      { role: "user", content: text },
    ];

    try {
      const full = await chatStreamAuto(
        outgoing,
        getStoredModel(),
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + delta } : m
            )
          );
        },
        controller.signal
      );
      convoRef.current = [...outgoing, { role: "assistant", content: full }];
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
            <p>Ask anything — code, explanations, rewrites.</p>
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
                  <div
                    className="ai-text-panel__msg-text ai-text-panel__msg-text--markdown"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(m.text || "…"),
                    }}
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
