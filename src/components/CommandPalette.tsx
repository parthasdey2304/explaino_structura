"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  category?: string;
  hint?: string;
  shortcut?: string;
  keywords?: string[];
  icon?: React.ReactNode;
  run: () => void;
}

/** Subsequence check: does pattern appear as an ordered subsequence in text? */
export function fuzzySubsequence(pattern: string, text: string): boolean {
  if (!pattern) return true;
  if (!text) return false;
  let pi = 0;
  for (let i = 0; i < text.length && pi < pattern.length; i++) {
    if (text[i] === pattern[pi]) pi++;
  }
  return pi === pattern.length;
}

/**
 * Calculates a match score for a single command against a search query.
 * Returns null if the command does not match all tokens in query.
 */
export function scoreCommand(cmd: PaletteCommand, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const label = cmd.label.toLowerCase();
  const category = (cmd.category || "").toLowerCase();
  const hint = (cmd.hint || "").toLowerCase();
  const shortcut = (cmd.shortcut || "").toLowerCase();
  const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());

  let totalScore = 0;

  for (const token of tokens) {
    let tokenMatched = false;
    let tokenBestScore = -Infinity;

    // 1. Exact match on label or keywords
    if (label === token) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 1000);
    } else if (keywords.some((k) => k === token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 900);
    }

    // 2. StartsWith match on label or keywords
    if (label.startsWith(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 650);
    } else {
      const words = label.split(/[\s:()/\-_.,]+/);
      if (words.some((w) => w.startsWith(token))) {
        tokenMatched = true;
        tokenBestScore = Math.max(tokenBestScore, 550);
      }
    }

    for (const kw of keywords) {
      if (kw.startsWith(token)) {
        tokenMatched = true;
        tokenBestScore = Math.max(tokenBestScore, 500);
      } else {
        const words = kw.split(/[\s:()/\-_.,]+/);
        if (words.some((w) => w.startsWith(token))) {
          tokenMatched = true;
          tokenBestScore = Math.max(tokenBestScore, 450);
        }
      }
    }

    // 3. Substring match on label or keywords
    if (label.includes(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 350);
    }

    if (keywords.some((k) => k.includes(token))) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 300);
    }

    // 4. Exact / startsWith / substring on shortcut or category or hint
    if (shortcut === token) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 300);
    } else if (shortcut.includes(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 180);
    }

    if (category === token) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 200);
    } else if (category.includes(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 150);
    }

    if (hint === token) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 180);
    } else if (hint.includes(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 120);
    }

    // 5. Fallback subsequence match
    if (!tokenMatched) {
      if (fuzzySubsequence(token, label)) {
        tokenMatched = true;
        tokenBestScore = Math.max(tokenBestScore, 60);
      } else if (keywords.some((k) => fuzzySubsequence(token, k))) {
        tokenMatched = true;
        tokenBestScore = Math.max(tokenBestScore, 50);
      } else if (category && fuzzySubsequence(token, category)) {
        tokenMatched = true;
        tokenBestScore = Math.max(tokenBestScore, 40);
      }
    }

    if (!tokenMatched) {
      return null;
    }

    totalScore += tokenBestScore;
  }

  return totalScore;
}

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const trimmed = query.trim();
  if (!trimmed) return commands;

  const scored: { cmd: PaletteCommand; score: number; index: number }[] = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const score = scoreCommand(cmd, trimmed);
    if (score !== null) {
      scored.push({ cmd, score, index: i });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return scored.map((s) => s.cmd);
}

export default function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return filterCommands(commands, query);
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const activeIndex = filtered.length > 0 ? Math.min(index, filtered.length - 1) : 0;

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length]);

  const runAt = (i: number) => {
    const targetIdx = filtered.length > 0 ? Math.min(i, filtered.length - 1) : 0;
    const cmd = filtered[targetIdx];
    if (!cmd) return;
    onClose();
    // Run after unmount so state settles first
    window.setTimeout(() => cmd.run(), 10);
  };

  return (
    <div className="cmd-palette__backdrop" onMouseDown={onClose}>
      <div
        className="cmd-palette excalidraw-island"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: "68vh",
          borderRadius: 14,
          background: "#16161a",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 28px 75px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Input Header */}
        <div
          className="cmd-palette__input-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.09)",
            background: "#1a1a20",
          }}
        >
          <Search size={16} style={{ color: "#a1a1aa", flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmd-palette__input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(activeIndex);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Type a command or search feature…"
            aria-label="Command search"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#f4f4f5",
              fontSize: 14,
              fontWeight: 500,
            }}
          />
          {query ? (
            <span
              style={{
                fontSize: 11,
                color: "#71717a",
                marginRight: 6,
              }}
            >
              {filtered.length} found
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "#71717a",
                marginRight: 6,
              }}
            >
              {commands.length} commands
            </span>
          )}
          <CornerDownLeft size={14} className="cmd-palette__enter-hint" style={{ color: "#71717a" }} />
        </div>

        {/* Command List */}
        <div
          className="cmd-palette__list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          style={{
            overflowY: "auto",
            padding: "6px 8px",
            maxHeight: "calc(68vh - 54px)",
          }}
        >
          {filtered.length === 0 && (
            <div
              className="cmd-palette__empty"
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "#71717a",
              }}
            >
              No matching command found for &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map((c, i) => {
            const isSelected = i === activeIndex;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isSelected}
                className={`cmd-palette__item${isSelected ? " cmd-palette__item--active" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => runAt(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: isSelected ? "rgba(99, 102, 241, 0.16)" : "transparent",
                  color: isSelected ? "#ffffff" : "#d4d4d8",
                  fontSize: 13,
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "background 0.1s ease, color 0.1s ease",
                  outline: "none",
                  marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  {c.icon && (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isSelected ? "#818cf8" : "#a1a1aa",
                        flexShrink: 0,
                      }}
                    >
                      {c.icon}
                    </span>
                  )}
                  <span
                    className="cmd-palette__label"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {c.label}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  {c.category && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isSelected ? "rgba(99, 102, 241, 0.22)" : "rgba(255, 255, 255, 0.05)",
                        color: isSelected ? "#c7d2fe" : "#71717a",
                      }}
                    >
                      {c.category}
                    </span>
                  )}
                  {c.shortcut && (
                    <kbd
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isSelected ? "rgba(0, 0, 0, 0.35)" : "rgba(255, 255, 255, 0.08)",
                        color: isSelected ? "#ffffff" : "#a1a1aa",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      {c.shortcut}
                    </kbd>
                  )}
                  {c.hint && !c.shortcut && (
                    <span
                      className="cmd-palette__hint"
                      style={{
                        fontSize: 11,
                        color: isSelected ? "#a5b4fc" : "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {c.hint}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
