"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ExcalidrawElement, AppState, ToolType } from "@/types";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import LeftSidebar from "./LeftSidebar";
import BottomControls from "./BottomControls";
import HamburgerMenu from "./HamburgerMenu";
import CodeEditorPanel from "./CodeEditorPanel";
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

  return (
    <div className={`excalidraw-wrapper ${appState.theme === "dark" ? "theme-dark" : ""}`}>
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
        appState={appState}
        setAppState={setAppState}
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
        <CodeEditorPanel onClose={() => setShowCodePanel(false)} />
      )}

      {saveStatus && (
        <div className="save-toast">{saveStatus}</div>
      )}
    </div>
  );
}