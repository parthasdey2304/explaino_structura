"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Check } from "lucide-react";
import {
  getEditorSettings,
  setEditorSettings,
  subscribeEditorSettings,
  type EditorSettings,
} from "@/lib/editorSettings";

const OPTIONS: { key: keyof EditorSettings; label: string; hint: string }[] = [
  {
    key: "emmetEnabled",
    label: "Emmet & snippets",
    hint: "Tab-to-expand abbreviations (HTML) and shorthand (syso, cl, def…)",
  },
  {
    key: "terminalEnabled",
    label: "Terminal",
    hint: "Sandboxed shell tab in the output panel",
  },
  {
    key: "aiEnabled",
    label: "AI assistant",
    hint: "Mistral-powered chat and code generation",
  },
];

/**
 * Gear dropdown, placed left of the Visualize button, for toggling optional
 * editor features on and off: Emmet/snippets, the sandboxed terminal, and
 * the AI assistant.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<EditorSettings>(() => getEditorSettings());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeEditorSettings(setSettings), []);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const toggle = useCallback((key: keyof EditorSettings) => {
    setEditorSettings({ [key]: !getEditorSettings()[key] });
  }, []);

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        className={`settings-menu__trigger${open ? " settings-menu__trigger--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Editor settings"
        id="editor-settings-button"
      >
        <Settings size={14} />
      </button>

      {open && (
        <div className="settings-menu__dropdown" role="menu">
          <div className="settings-menu__title">Editor Features</div>
          {OPTIONS.map((opt) => {
            const active = settings[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                className="settings-menu__item"
                onClick={() => toggle(opt.key)}
              >
                <span className={`settings-menu__checkbox${active ? " settings-menu__checkbox--on" : ""}`}>
                  {active && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="settings-menu__item-text">
                  <span className="settings-menu__item-label">{opt.label}</span>
                  <span className="settings-menu__item-hint">{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
