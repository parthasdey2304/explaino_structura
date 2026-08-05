"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ExcalidrawElement, AppState, ToolType } from "@/types";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import LeftSidebar from "./LeftSidebar";
import BottomControls from "./BottomControls";
import HamburgerMenu from "./HamburgerMenu";
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  defaultAppState,
} from "@/lib/localStorage";

const MAX_HISTORY = 50;

export default function App() {
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [appState, setAppState] = useState<AppState>({
    ...defaultAppState,
    viewBackgroundColor: "#ffffff",
  });
  const [activeTool, setActiveTool] = useState<ToolType>("freedraw");
  const [isLocked, setIsLocked] = useState(false);
  const [history, setHistory] = useState<ExcalidrawElement[][]>([[]])
  const [historyIndex, setHistoryIndex] = useState(0);
  const [drawingName, setDrawingName] = useState("Untitled");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const isRestoringHistory = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-load from localStorage on mount
  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved) {
      setElements(saved.elements || []);
      if (saved.appState) {
        setAppState((prev) => ({ ...prev, ...saved.appState }));
      }
      if (saved.name) setDrawingName(saved.name);
      setHistory([saved.elements || []]);
      setHistoryIndex(0);
    }
  }, []);

  // Auto-save to localStorage whenever elements or appState changes (debounced)
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveToLocalStorage(elements, appState, drawingName);
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [elements, appState, drawingName]);

  const pushHistory = useCallback(
    (newElements: ExcalidrawElement[]) => {
      if (isRestoringHistory.current) return;
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(structuredClone(newElements));
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        return newHistory;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [historyIndex]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      pushHistory(elements);
    }, 500);
    return () => clearTimeout(timeout);
  }, [elements, pushHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    isRestoringHistory.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setElements(structuredClone(history[newIndex]));
    setTimeout(() => { isRestoringHistory.current = false; }, 100);
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isRestoringHistory.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setElements(structuredClone(history[newIndex]));
    setTimeout(() => { isRestoringHistory.current = false; }, 100);
  }, [history, historyIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleNewDrawing = useCallback(() => {
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setDrawingName("Untitled");
    clearLocalStorage();
  }, []);

  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${drawingName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [drawingName]);

  const handleZoomIn = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      zoom: { value: Math.min(10, prev.zoom.value * 1.2) },
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      zoom: { value: Math.max(0.1, prev.zoom.value / 1.2) },
    }));
  }, []);

  const handleResetZoom = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
    }));
  }, []);

  const codeSnippet = elements
    .filter((el) => !el.isDeleted)
    .map((el) => {
      switch (el.type) {
        case "rectangle":
          return `/* Rectangle */\nctx.fillStyle = "${el.backgroundColor}";\nctx.strokeStyle = "${el.strokeColor}";\nctx.fillRect(${Math.round(el.x)}, ${Math.round(el.y)}, ${Math.round(el.width)}, ${Math.round(el.height)});`;
        case "ellipse":
          return `/* Ellipse */\nctx.beginPath();\nctx.ellipse(${Math.round(el.x + el.width/2)}, ${Math.round(el.y + el.height/2)}, ${Math.round(Math.abs(el.width/2))}, ${Math.round(Math.abs(el.height/2))}, 0, 0, Math.PI * 2);\nctx.fill();\nctx.stroke();`;
        case "freedraw":
          return `/* Freehand Stroke (${el.points?.length || 0} points) */`;
        case "text":
          return `/* Text */\nctx.fillText("${el.text || ""}", ${Math.round(el.x)}, ${Math.round(el.y)});`;
        default:
          return `/* ${el.type} */`;
      }
    })
    .join("\n\n");

  return (
    <div className="excalidraw-wrapper">
      <Toolbar
        activeTool={activeTool}
        setActiveTool={(tool) => {
          setActiveTool(tool);
        }}
        onMenuClick={() => setShowMenu(!showMenu)}
        onCodeClick={() => setShowCodePanel(!showCodePanel)}
        onPanelToggle={() => setShowSidebar(!showSidebar)}
        showSidebar={showSidebar}
        isLocked={isLocked}
        setIsLocked={setIsLocked}
      />

      <HamburgerMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onNewDrawing={handleNewDrawing}
        onExportPNG={handleExportPNG}
      />

      <LeftSidebar
        appState={appState}
        setAppState={setAppState}
        isOpen={showSidebar}
      />

      <Canvas
        elements={elements}
        setElements={setElements}
        appState={appState}
        setAppState={setAppState}
        activeTool={activeTool}
      />

      <BottomControls
        zoomValue={appState.zoom.value}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Code side panel */}
      {showCodePanel && (
        <div className="code-panel excalidraw-island">
          <div className="code-panel__header">
            <span className="code-panel__title">Exported Code</span>
            <button
              onClick={() => setShowCodePanel(false)}
              className="tool-icon-btn"
              style={{ width: "1.75rem", height: "1.75rem" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="code-panel__body">
            {codeSnippet ? (
              <pre className="code-panel__pre">{codeSnippet}</pre>
            ) : (
              <div className="code-panel__empty">
                Draw shapes on the canvas to generate code
              </div>
            )}
          </div>
        </div>
      )}

      {saveStatus && (
        <div className="save-toast">{saveStatus}</div>
      )}
    </div>
  );
}