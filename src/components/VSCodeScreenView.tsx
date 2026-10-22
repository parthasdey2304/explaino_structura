"use client";

import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import {
  Files,
  Search,
  GitBranch,
  Play,
  Settings,
  ChevronDown,
  ChevronRight,
  FileCode,
  X,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { STARTER_CODE } from "@/lib/workspace";

const vsDarkTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "12.5px",
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
    },
    ".cm-scroller": {
      fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "8px 0",
      caretColor: "#aeafad",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      borderRight: "1px solid #2d2d30",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 12px",
      minWidth: "32px",
      textAlign: "right",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      color: "#c6c6c6",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#264f78",
    },
  },
  { dark: true }
);

const vsHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: tags.keyword, color: "#569cd6", fontWeight: "600" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.definition(tags.variableName), color: "#9cdcfe" },
  { tag: tags.propertyName, color: "#9cdcfe" },
  { tag: tags.operator, color: "#d4d4d4" },
  { tag: tags.bool, color: "#569cd6" },
  { tag: tags.null, color: "#569cd6" },
]);

interface VSCodeScreenViewProps {
  code?: string;
  fileName?: string;
  onRun?: () => void;
}

export default function VSCodeScreenView({
  code = STARTER_CODE.javascript,
  fileName = "bst.js",
}: VSCodeScreenViewProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const state = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        javascript(),
        vsDarkTheme,
        syntaxHighlighting(vsHighlight),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [code]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#18181b",
        color: "#cccccc",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Workbench Workspace Area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* VS Code Activity Bar (Left 44px) */}
        <div
          style={{
            width: 44,
            backgroundColor: "#252526",
            borderRight: "1px solid #2d2d30",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 8,
            paddingBottom: 8,
            justifyContent: "space-between",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          {/* Top Activity Icons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            {/* Active Explorer Item */}
            <div
              style={{
                position: "relative",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                cursor: "pointer",
              }}
              title="Explorer (Ctrl+Shift+E)"
            >
              <div
                style={{
                  position: "absolute",
                  left: -4,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  backgroundColor: "#ffffff",
                  borderRadius: 1,
                }}
              />
              <Files size={20} strokeWidth={1.75} />
            </div>

            <div
              style={{ color: "#858585", cursor: "pointer" }}
              title="Search (Ctrl+Shift+F)"
            >
              <Search size={20} strokeWidth={1.75} />
            </div>

            <div
              style={{ color: "#858585", cursor: "pointer", position: "relative" }}
              title="Source Control (Ctrl+Shift+G)"
            >
              <GitBranch size={20} strokeWidth={1.75} />
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  background: "#007acc",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: "50%",
                  width: 13,
                  height: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                1
              </span>
            </div>

            <div
              style={{ color: "#858585", cursor: "pointer" }}
              title="Run and Debug (Ctrl+Shift+D)"
            >
              <Play size={20} strokeWidth={1.75} />
            </div>
          </div>

          {/* Bottom Activity Icons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <div style={{ color: "#858585", cursor: "pointer" }} title="Manage Settings">
              <Settings size={20} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        {/* VS Code Explorer Sidebar (Width: 175px) */}
        <div
          style={{
            width: 175,
            backgroundColor: "#1c1c1f",
            borderRight: "1px solid #2d2d30",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            userSelect: "none",
            fontSize: 11.5,
          }}
        >
          {/* Explorer Header */}
          <div
            style={{
              padding: "9px 14px",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Explorer</span>
            <span style={{ fontSize: 13, color: "#71717a", cursor: "pointer" }}>•••</span>
          </div>

          {/* Folder: WORKSPACE */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                fontWeight: 700,
                color: "#e4e4e7",
                cursor: "pointer",
              }}
            >
              <ChevronDown size={14} color="#a1a1aa" />
              <span>EXPLAINO-STRUCTURA</span>
            </div>

            {/* Folder: src */}
            <div style={{ paddingLeft: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  color: "#d4d4d8",
                  cursor: "pointer",
                }}
              >
                <ChevronDown size={14} color="#a1a1aa" />
                <span>src</span>
              </div>

              {/* Files in src */}
              <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 1 }}>
                {/* Active file: bst.js */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    borderRadius: 4,
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <FileCode size={13} color="#facc15" />
                  <span>{fileName}</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    color: "#a1a1aa",
                    cursor: "pointer",
                  }}
                >
                  <FileCode size={13} color="#60a5fa" />
                  <span>graph.ts</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    color: "#a1a1aa",
                    cursor: "pointer",
                  }}
                >
                  <FileCode size={13} color="#4ade80" />
                  <span>queue.py</span>
                </div>
              </div>
            </div>

            {/* Root files */}
            <div style={{ paddingLeft: 22, marginTop: 4, display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", color: "#a1a1aa" }}>
                <FileCode size={13} color="#eab308" />
                <span>package.json</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", color: "#a1a1aa" }}>
                <FileCode size={13} color="#38bdf8" />
                <span>README.md</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Editor Column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "#1e1e1e",
          }}
        >
          {/* Tab Bar */}
          <div
            style={{
              height: 35,
              backgroundColor: "#252526",
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid #1e1e1e",
              userSelect: "none",
            }}
          >
            {/* Active Tab */}
            <div
              style={{
                height: "100%",
                padding: "0 14px",
                backgroundColor: "#1e1e1e",
                borderTop: "2px solid #007acc",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#ffffff",
                cursor: "pointer",
                borderRight: "1px solid #252526",
              }}
            >
              <FileCode size={14} color="#facc15" />
              <span>{fileName}</span>
              <X size={13} color="#a1a1aa" style={{ marginLeft: 4 }} />
            </div>

            {/* Inactive Tab */}
            <div
              style={{
                height: "100%",
                padding: "0 14px",
                backgroundColor: "#2d2d2d",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#969696",
                cursor: "pointer",
                borderRight: "1px solid #252526",
              }}
            >
              <FileCode size={14} color="#60a5fa" />
              <span>graph.ts</span>
            </div>
          </div>

          {/* Breadcrumb Path */}
          <div
            style={{
              height: 22,
              padding: "0 14px",
              backgroundColor: "#1e1e1e",
              borderBottom: "1px solid #282828",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "#858585",
              userSelect: "none",
            }}
          >
            <span>explaino-structura</span>
            <ChevronRight size={11} />
            <span>src</span>
            <ChevronRight size={11} />
            <span style={{ color: "#cccccc" }}>{fileName}</span>
            <ChevronRight size={11} />
            <span style={{ color: "#dcdcaa" }}>BinarySearchTree</span>
          </div>

          {/* CodeMirror Surface */}
          <div
            ref={editorContainerRef}
            style={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
            }}
          />
        </div>
      </div>

      {/* VS Code Blue Status Bar (Bottom 22px) */}
      <div
        style={{
          height: 22,
          backgroundColor: "#007acc",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          fontSize: 11,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {/* Left Status Bar Items */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <GitBranch size={12} />
            <span style={{ fontWeight: 600 }}>main*</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <CheckCircle2 size={12} />
            <span>0 errors, 0 warnings</span>
          </div>
        </div>

        {/* Right Status Bar Items */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>Ln 42, Col 18</span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
          <span style={{ fontWeight: 600 }}>JavaScript</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Bell size={11} />
          </div>
        </div>
      </div>
    </div>
  );
}
