"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Type, X } from "lucide-react";
import { chatStreamAuto, MistralError, type ChatMessage } from "@/lib/ai/mistral";

const TEXT_GEN_SYSTEM_PROMPT =
  "You are Explaino Canvas Text Editor. Output ONLY raw text content that will be placed directly onto an Excalidraw canvas. " +
  "No greetings, no explanations, no markdown commentary. Every line must be pure content.";

export interface CanvasTextItem {
  id: string;
  text: string;
  raw: string;
}

export default function CanvasTextPanel({
  items,
  selectedId,
  onSelect,
  onUpdateText,
  onInsertText,
  onClose,
}: {
  items: CanvasTextItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onInsertText: (text: string) => void;
  onClose: () => void;
}) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selected = items.find((t) => t.id === selectedId) ?? null;
  const selectedRaw = selected ? selected.raw : "";

  const sendAi = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || isStreaming) return;
    setError(null);
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const targetText = selectedRaw;
    const userContent = selected
      ? `Current text:\n${targetText}\n\nInstruction: ${prompt}\n\nRewrite or extend the current text per the instruction. Output only the new text.`
      : prompt;
    const convo: ChatMessage[] = [
      { role: "system", content: TEXT_GEN_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
    try {
      let acc = "";
      await chatStreamAuto(
        convo,
        "open-mistral-nemo",
        (delta) => {
          acc += delta;
          if (selected) onUpdateText(selected.id, acc);
        },
        controller.signal
      );
      if (!selected) onInsertText(acc.trim());
      setAiPrompt("");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof MistralError || err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [aiPrompt, isStreaming, selected, onUpdateText, onInsertText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="todo-panel excalidraw-island text-panel" role="dialog" aria-label="Canvas text">
      <div className="todo-panel__header">
        <span className="todo-panel__title">
          <Type size={14} strokeWidth={2.2} />
          Canvas Text
        </span>
        <button type="button" className="todo-panel__close" onClick={onClose} title="Close" aria-label="Close">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="text-panel__ai">
        <input
          className="todo-panel__input"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendAi();
            }
          }}
          placeholder={selected ? "Tell AI to update selected text…" : "Tell AI to write text…"}
          aria-label="AI text command"
        />
        <button
          type="button"
          className="todo-panel__add"
          disabled={!aiPrompt.trim() || isStreaming}
          onClick={sendAi}
          title="Send to AI"
          aria-label="Send to AI"
        >
          {isStreaming ? <Loader2 size={14} className="ai-text-panel__spin" /> : <Send size={14} />}
        </button>
      </div>
      {error && <div className="text-panel__error">{error}</div>}

      <ul className="todo-panel__list">
        {items.length === 0 && (
          <li className="todo-panel__empty">No text on canvas yet — type with the T tool or use AI above.</li>
        )}
        {items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`text-panel__item${t.id === selectedId ? " text-panel__item--active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              {t.raw.length > 60 ? `${t.raw.slice(0, 60)}…` : t.raw || "(empty)"}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <textarea
          className="text-panel__editor"
          value={selectedRaw}
          onChange={(e) => onUpdateText(selected.id, e.target.value)}
          aria-label="Edit selected text"
        />
      )}
    </div>
  );
}
