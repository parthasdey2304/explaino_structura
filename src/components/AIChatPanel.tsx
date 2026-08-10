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
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Trash2,
  Phone,
  PhoneOff,
} from "lucide-react";
import {
  GeminiLiveSession,
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/lib/ai/gemini-live";
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

interface AIChatPanelProps {
  onClose: () => void;
  activeFile: WorkspaceFile | null;
  onApplyCode: (code: string) => void;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  attachment?: { name: string; type: string; content: string } | null;
}

interface AttachedFile {
  name: string;
  type: string;
  content: string;
}

let _msgCounter = 0;
const nextId = () => `m${++_msgCounter}-${Date.now().toString(36)}`;

const SYSTEM_PROMPT =
  "You are a concise coding assistant embedded in a browser-based code editor. " +
  "When asked to write or modify code, respond with a short explanation followed by a single fenced code block " +
  "containing the complete file content (not a diff). Prefer the language of the file the user is editing. " +
  "You may receive attached files (text or images). Use their content to answer the user's question accurately.";

export default function AIChatPanel({
  onClose,
  activeFile,
  onApplyCode,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadChatHistory());
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [showKeyInput, setShowKeyInput] = useState(() => !getStoredApiKey());
  const [model, setModel] = useState(() => getStoredModel());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => getStoredGeminiKey());
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>("");
  const [showGeminiKey, setShowGeminiKey] = useState(() => !getStoredGeminiKey());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setTtsSupported("speechSynthesis" in window);
  }, []);

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
      let text = m.text;
      if (m.attachment) {
        const att = m.attachment;
        if (att.type.startsWith("image/")) {
          text += `\n\n[Attached image: ${att.name}]`;
        } else {
          text += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``;
        }
      }
      base.push({ role: m.role, content: text });
    }
    return base;
  }, [messages]);

  // ── File attachment ───────────────────────────────────────────────────
  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setAttachedFile({ name: file.name, type: file.type, content: result });
      } else if (result instanceof ArrayBuffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(result)));
        setAttachedFile({ name: file.name, type: file.type, content: base64 });
      }
    };
    if (file.type.startsWith("image/")) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = "";
  }, []);

  const clearAttachment = useCallback(() => setAttachedFile(null), []);

  // ── Voice: Speech-to-Text ─────────────────────────────────────────────
  function createSpeechRecognition() {
    const Ctor = (window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!Ctor) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recog = new (Ctor as any)();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    return recog;
  }

  const startListening = useCallback(() => {
    if (!speechSupported) return;
    const recog = createSpeechRecognition();
    if (!recog) return;
    recognitionRef.current = recog;
    let finalTranscript = "";
    let interimTranscript = "";

    recog.onresult = (event: { results: SpeechRecognitionResultList }) => {
      interimTranscript = "";
      for (let i = event.results.length - 1; i >= 0; i--) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      setInput(finalTranscript + interimTranscript);
    };
    recog.onerror = () => setIsListening(false);
    recog.onend = () => setIsListening(false);
    recog.start();
    setIsListening(true);
  }, [speechSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // ── Voice: Text-to-Speech ─────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!ttsSupported || isSpeaking) {
      if (isSpeaking) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const cleanText = text.replace(/```[\s\S]*?```/g, " code block ").replace(/[#*_~`>\-]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [ttsSupported, isSpeaking]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Send message ───────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && !attachedFile) return;
    if (isStreaming) return;

    if (!getStoredApiKey()) {
      setShowKeyInput(true);
      return;
    }

    stopListening();
    stopSpeaking();

    let messageText = text;
    if (attachedFile && !attachedFile.type.startsWith("image/")) {
      messageText += `\n\n[Attached file: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\``;
    }

    const contextPrefix = activeFile
      ? `Active file: ${activeFile.name} (${activeFile.language})\n\n${activeFile.content}\n\n---\n\n`
      : "";

    const userMsg: DisplayMessage = {
      id: nextId(),
      role: "user",
      text: messageText,
      attachment: attachedFile && attachedFile.type.startsWith("image/")
        ? attachedFile
        : null,
    };
    const assistantId = nextId();
    streamingIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", text: "" }]);
    setInput("");
    setAttachedFile(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const outgoing: ChatMessage[] = [
      ...history,
      { role: "user", content: contextPrefix ? `${contextPrefix}${messageText}` : messageText },
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
      const code = extractFirstCodeBlock(full);
      if (code && activeFile) onApplyCode(code);
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
  }, [input, attachedFile, isStreaming, activeFile, history, model, onApplyCode, stopListening, stopSpeaking]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copyMessage = useCallback((id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    });
  }, []);

  const copyCode = useCallback((id: string, text: string) => {
    const code = extractFirstCodeBlock(text);
    if (code) {
      navigator.clipboard?.writeText(code).then(() => {
        setCopiedCodeId(id);
        setTimeout(() => setCopiedCodeId((prev) => (prev === id ? null : prev)), 1500);
      });
    }
  }, []);

  const applyMessage = useCallback(
    (text: string) => {
      const code = extractFirstCodeBlock(text);
      if (code) onApplyCode(code);
    },
    [onApplyCode]
  );

  // ── Gemini Live voice mode ──────────────────────────────────────────────
  const startVoiceMode = useCallback(() => {
    const key = geminiKey.trim() || getStoredGeminiKey();
    if (!key) {
      setShowGeminiKey(true);
      return;
    }
    setVoiceStatus("Connecting...");
    const session = new GeminiLiveSession(key, {
      onAudioStart: () => setVoiceStatus("Speaking..."),
      onAudioEnd: () => setVoiceStatus("Listening..."),
      onTextDelta: (delta) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("voice-")) {
            return prev.map((m) => (m.id === last.id ? { ...m, text: m.text + delta } : m));
          }
          return [...prev, { id: `voice-${nextId()}`, role: "assistant", text: delta }];
        });
      },
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setMessages((prev) => [
            ...prev,
            { id: `voice-user-${nextId()}`, role: "user", text },
          ]);
        }
      },
      onError: (err) => {
        setVoiceStatus(`Error: ${err}`);
        setTimeout(() => {
          setVoiceMode(false);
          setVoiceStatus("");
        }, 3000);
      },
      onClose: () => {
        setVoiceMode(false);
        setVoiceStatus("");
      },
    });
    geminiSessionRef.current = session;
    setVoiceMode(true);
    setVoiceStatus("Listening...");
    session.start().catch((err) => {
      setVoiceStatus(`Failed: ${err.message}`);
      setVoiceMode(false);
    });
  }, [geminiKey]);

  const stopVoiceMode = useCallback(() => {
    geminiSessionRef.current?.stop();
    geminiSessionRef.current = null;
    setVoiceMode(false);
    setVoiceStatus("");
  }, []);

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) stopVoiceMode();
    else startVoiceMode();
  }, [voiceMode, startVoiceMode, stopVoiceMode]);

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

      {showGeminiKey && (
        <div className="ai-chat-panel__keybox">
          <label className="ai-chat-panel__keybox-label">
            Google AI Studio API key (for voice)
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                setStoredGeminiKey(e.target.value);
              }}
              placeholder="Paste your key — stored only in this browser"
              className="ai-chat-panel__keybox-input"
              autoComplete="off"
            />
          </label>
          <p className="ai-chat-panel__keybox-hint">
            Get a key at{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">
              aistudio.google.com/apikey
            </a>
            . Used only for voice conversations — sent directly to Google's Live API from your browser.
          </p>
        </div>
      )}

      <div className="ai-chat-panel__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-chat-panel__empty">
            <Bot size={22} />
            <p>Ask about your code, or request a feature — I can see the active file.</p>
            <p className="ai-chat-panel__empty-hint">
              Attach files or images with the paperclip icon, or use the mic to speak.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ai-chat-panel__msg ai-chat-panel__msg--${m.role}`}>
            <div className="ai-chat-panel__msg-icon">
              {m.role === "user" ? <User size={13} /> : m.role === "error" ? <X size={13} /> : <Bot size={13} />}
            </div>
            <div className="ai-chat-panel__msg-body">
              {m.role === "user" && m.attachment?.type.startsWith("image/") && (
                <div className="ai-chat-panel__attachment">
                  <img src={m.attachment.content} alt={m.attachment.name} />
                  <span className="ai-chat-panel__attachment-name">{m.attachment.name}</span>
                </div>
              )}
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
                  {extractFirstCodeBlock(m.text) && (
                    <button
                      type="button"
                      className="ai-chat-panel__msg-action"
                      onClick={() => copyCode(m.id, m.text)}
                    >
                      {copiedCodeId === m.id ? <ClipboardCheck size={11} /> : <FileCode size={11} />}
                      <span>{copiedCodeId === m.id ? "Code copied" : "Copy code"}</span>
                    </button>
                  )}
                  {extractFirstCodeBlock(m.text) && activeFile && (
                    <button
                      type="button"
                      className="ai-chat-panel__msg-action ai-chat-panel__msg-action--primary"
                      onClick={() => applyMessage(m.text)}
                    >
                      <FileCode size={11} />
                      <span>Apply to file</span>
                    </button>
                  )}
                  {ttsSupported && (
                    <button
                      type="button"
                      className="ai-chat-panel__msg-action"
                      onClick={() => speakText(m.text)}
                      title={isSpeaking ? "Stop reading" : "Read aloud"}
                    >
                      {isSpeaking ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      <span>{isSpeaking ? "Stop" : "Speak"}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Composer with attachment and voice */}
      <div className="ai-chat-panel__composer">
        {attachedFile && (
          <div className="ai-chat-panel__attached">
            {attachedFile.type.startsWith("image/") ? (
              <img src={attachedFile.content} alt={attachedFile.name} className="ai-chat-panel__attached-preview" />
            ) : (
              <FileCode size={12} />
            )}
            <span className="ai-chat-panel__attached-name">{attachedFile.name}</span>
            <button type="button" className="ai-chat-panel__attached-remove" onClick={clearAttachment} title="Remove">
              <X size={10} />
            </button>
          </div>
        )}
        {voiceMode && (
          <div className="ai-chat-panel__voice-status">
            <span className="ai-chat-panel__voice-dot" />
            <span>{voiceStatus || "Voice call active"}</span>
          </div>
        )}
        <div className="ai-chat-panel__input-row">
          <input
            ref={fileInputRef}
            type="file"
            className="ai-chat-panel__file-input"
            accept="image/*,.txt,.js,.ts,.py,.java,.cpp,.c,.html,.css,.json,.md,.xml,.csv"
            onChange={handleFileAttach}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="ai-chat-panel__attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or image"
          >
            <Paperclip size={14} />
          </button>
          {speechSupported && (
            <button
              type="button"
              className={`ai-chat-panel__mic-btn${isListening ? " ai-chat-panel__mic-btn--active" : ""}`}
              onClick={toggleListening}
              title={isListening ? "Stop recording" : "Voice input"}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button
            type="button"
            className={`ai-chat-panel__voice-btn${voiceMode ? " ai-chat-panel__voice-btn--active" : ""}`}
            onClick={toggleVoiceMode}
            title={voiceMode ? "End voice call" : "Voice call"}
          >
            {voiceMode ? <PhoneOff size={14} /> : <Phone size={14} />}
          </button>
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
              disabled={!input.trim() && !attachedFile}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
