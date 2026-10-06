"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function fuzzyMatch(query: string, label: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const l = label.toLowerCase();
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

  const filtered = useMemo(() => commands.filter((c) => fuzzyMatch(query, c.label)), [commands, query]);

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
    // Run after unmount so panel state settles first.
    window.setTimeout(() => cmd.run(), 0);
  };

  return (
    <div className="cmd-palette__backdrop" onMouseDown={onClose}>
      <div
        className="cmd-palette excalidraw-island"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmd-palette__input-row">
          <Search size={15} />
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
            placeholder="Type a command…"
            aria-label="Command search"
          />
          <CornerDownLeft size={14} className="cmd-palette__enter-hint" />
        </div>
        <div className="cmd-palette__list" ref={listRef} role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="cmd-palette__empty">No matching command.</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === index}
              data-active={i === index}
              className={`cmd-palette__item${i === index ? " cmd-palette__item--active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => runAt(i)}
            >
              <span className="cmd-palette__label">{c.label}</span>
              {c.hint && <span className="cmd-palette__hint">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
