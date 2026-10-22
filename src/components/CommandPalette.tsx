"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  category?: string;
  hint?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  run: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const l = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) qi++;
  }
  return qi === q.length;
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
    return commands.filter((c) => {
      const matchLabel = fuzzyMatch(query, c.label);
      const matchCategory = c.category ? fuzzyMatch(query, c.category) : false;
      const matchHint = c.hint ? fuzzyMatch(query, c.hint) : false;
      const matchShortcut = c.shortcut ? fuzzyMatch(query, c.shortcut) : false;
      return matchLabel || matchCategory || matchHint || matchShortcut;
    });
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, filtered.length]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(index);
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
            const isSelected = i === index;
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
