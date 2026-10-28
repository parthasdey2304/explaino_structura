"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Check, X, Clock, ArrowUpRight } from "lucide-react";

interface StopwatchProps {
  theme: "light" | "dark";
  className?: string;
}

const STORAGE_KEY = "explaino-stopwatch-state";

export default function Stopwatch({ theme, className = "" }: StopwatchProps) {
  // State: total seconds on the stopwatch / timer
  const [timeInSeconds, setTimeInSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [mode, setMode] = useState<"countdown" | "countup">("countdown");
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Edit fields (strings to allow direct typing of HH, MM, SS)
  const [editHours, setEditHours] = useState<string>("00");
  const [editMinutes, setEditMinutes] = useState<string>("00");
  const [editSeconds, setEditSeconds] = useState<string>("00");

  const popoverRef = useRef<HTMLDivElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  // Load initial state from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.timeInSeconds === "number" && parsed.timeInSeconds >= 0) {
          setTimeInSeconds(parsed.timeInSeconds);
        }
        if (parsed.mode === "countdown" || parsed.mode === "countup") {
          setMode(parsed.mode);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ timeInSeconds, mode })
      );
    } catch {
      // Ignore write errors
    }
  }, [timeInSeconds, mode]);

  // Timer interval ticker
  useEffect(() => {
    if (!isRunning) return;

    if (mode === "countdown" && timeInSeconds <= 0) {
      setIsRunning(false);
      return;
    }

    const interval = setInterval(() => {
      setTimeInSeconds((prev) => {
        if (mode === "countdown") {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        } else {
          return prev + 1;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, mode, timeInSeconds]);

  // Click outside listener to dismiss editing popover
  useEffect(() => {
    if (!isEditing) return;

    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        handleSaveEdit();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEditing(false);
      } else if (event.key === "Enter") {
        handleSaveEdit();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, editHours, editMinutes, editSeconds]);

  // Calculate formatted HH:MM:SS
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = timeInSeconds % 60;

  const formattedHours = String(hours).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(seconds).padStart(2, "0");

  // Open edit modal / popover
  const handleOpenEdit = useCallback(() => {
    // Pause running timer when editing
    setIsRunning(false);
    setEditHours(formattedHours);
    setEditMinutes(formattedMinutes);
    setEditSeconds(formattedSeconds);
    setIsEditing(true);
    setTimeout(() => {
      hoursInputRef.current?.select();
    }, 50);
  }, [formattedHours, formattedMinutes, formattedSeconds]);

  // Save edited time
  const handleSaveEdit = useCallback(() => {
    const h = Math.max(0, Math.min(99, parseInt(editHours, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(editMinutes, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(editSeconds, 10) || 0));
    const total = h * 3600 + m * 60 + s;
    setTimeInSeconds(total);
    setMode("countdown");
    setIsEditing(false);
  }, [editHours, editMinutes, editSeconds]);

  // Quick preset helper
  const handleSetPreset = (h: number, m: number, s: number = 0) => {
    const total = h * 3600 + m * 60 + s;
    setTimeInSeconds(total);
    setMode("countdown");
    setEditHours(String(h).padStart(2, "0"));
    setEditMinutes(String(m).padStart(2, "0"));
    setEditSeconds(String(s).padStart(2, "0"));
    setIsEditing(false);
  };

  // Start count up stopwatch mode
  const handleStartCountUp = () => {
    setTimeInSeconds(0);
    setMode("countup");
    setIsEditing(false);
    setIsRunning(true);
  };

  // Reset to 00:00:00
  const handleReset = () => {
    setTimeInSeconds(0);
    setIsRunning(false);
    setEditHours("00");
    setEditMinutes("00");
    setEditSeconds("00");
    setIsEditing(false);
  };

  // Toggle running state
  const handleToggleRunning = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      setIsRunning(false);
    } else {
      // If time is 0 and mode is countdown, prompt editing or start countup
      if (timeInSeconds === 0 && mode === "countdown") {
        handleOpenEdit();
        return;
      }
      setIsRunning(true);
    }
  };

  const isDark = theme === "dark";

  // When time is 00:00:00 and not running countup, do NOT render start or stop button to the right of seconds
  const showButton = isRunning || timeInSeconds > 0;

  return (
    <div
      className={`relative inline-flex items-center gap-2 select-none z-20 ${className}`}
      data-testid="stopwatch-container"
    >
      {/* Clickable time numbers in Orbitron font */}
      <button
        type="button"
        onClick={handleOpenEdit}
        className={`font-orbitron font-bold text-lg sm:text-xl tracking-wider transition-colors duration-150 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 ${
          isDark
            ? "text-white hover:bg-white/10 focus:ring-white/30"
            : "text-black hover:bg-black/10 focus:ring-black/20"
        }`}
        title="Click to change time"
        aria-label={`Stopwatch time: ${formattedHours}:${formattedMinutes}:${formattedSeconds}. Click to change.`}
      >
        <span>{formattedHours}</span>:<span>{formattedMinutes}</span>:<span>{formattedSeconds}</span>
      </button>

      {/* Play / Pause button:
          Shown only when time is > 00:00:00 or when running.
          When time is 00:00:00, there is NO start or stop button to the right of the seconds. */}
      {showButton && (
        <button
          type="button"
          onClick={handleToggleRunning}
          className={`p-1 sm:p-1.5 rounded-md transition-colors duration-150 flex items-center justify-center focus:outline-none focus:ring-1 ${
            isDark
              ? "text-white hover:bg-white/15 active:bg-white/25 focus:ring-white/30"
              : "text-black hover:bg-black/10 active:bg-black/20 focus:ring-black/20"
          }`}
          title={isRunning ? "Pause" : "Play / Start"}
          aria-label={isRunning ? "Pause stopwatch" : "Start stopwatch"}
        >
          {isRunning ? (
            <Pause size={18} strokeWidth={2.4} fill="currentColor" />
          ) : (
            <Play size={18} strokeWidth={2.4} fill="currentColor" />
          )}
        </button>
      )}

      {/* Time Editor Popover */}
      {isEditing && (
        <div
          ref={popoverRef}
          className={`absolute top-full left-0 mt-2 p-3 sm:p-4 rounded-xl shadow-2xl border backdrop-blur-md z-50 flex flex-col gap-3 min-w-[280px] animate-in fade-in zoom-in-95 duration-150 ${
            isDark
              ? "bg-[#18181b]/95 border-zinc-700/80 text-white shadow-black/60"
              : "bg-white/95 border-zinc-200 text-zinc-900 shadow-zinc-400/40"
          }`}
          style={{ minWidth: 280 }}
          role="dialog"
          aria-label="Change stopwatch time"
        >
          <div className="flex items-center justify-between pb-1 border-b border-zinc-500/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-75">
              <Clock size={13} />
              <span>Set Stopwatch / Timer</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1 rounded hover:bg-zinc-500/20 opacity-60 hover:opacity-100 transition-opacity"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Time input boxes (HH : MM : SS) */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            <div className="flex flex-col items-center">
              <label className="text-[10px] uppercase font-mono opacity-60 mb-0.5">Hours</label>
              <input
                ref={hoursInputRef}
                type="number"
                min="0"
                max="99"
                value={editHours}
                onChange={(e) => setEditHours(e.target.value.slice(-2))}
                onBlur={() => setEditHours(String(Math.min(99, Math.max(0, parseInt(editHours, 10) || 0))).padStart(2, "0"))}
                className={`w-14 h-11 text-center font-orbitron font-bold text-lg rounded-lg border focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-zinc-800/90 border-zinc-700 text-white focus:ring-indigo-500"
                    : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:ring-indigo-600"
                }`}
              />
            </div>
            <span className="font-orbitron font-bold text-lg pt-4 opacity-50">:</span>
            <div className="flex flex-col items-center">
              <label className="text-[10px] uppercase font-mono opacity-60 mb-0.5">Min</label>
              <input
                type="number"
                min="0"
                max="59"
                value={editMinutes}
                onChange={(e) => setEditMinutes(e.target.value.slice(-2))}
                onBlur={() => setEditMinutes(String(Math.min(59, Math.max(0, parseInt(editMinutes, 10) || 0))).padStart(2, "0"))}
                className={`w-14 h-11 text-center font-orbitron font-bold text-lg rounded-lg border focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-zinc-800/90 border-zinc-700 text-white focus:ring-indigo-500"
                    : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:ring-indigo-600"
                }`}
              />
            </div>
            <span className="font-orbitron font-bold text-lg pt-4 opacity-50">:</span>
            <div className="flex flex-col items-center">
              <label className="text-[10px] uppercase font-mono opacity-60 mb-0.5">Sec</label>
              <input
                type="number"
                min="0"
                max="59"
                value={editSeconds}
                onChange={(e) => setEditSeconds(e.target.value.slice(-2))}
                onBlur={() => setEditSeconds(String(Math.min(59, Math.max(0, parseInt(editSeconds, 10) || 0))).padStart(2, "0"))}
                className={`w-14 h-11 text-center font-orbitron font-bold text-lg rounded-lg border focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-zinc-800/90 border-zinc-700 text-white focus:ring-indigo-500"
                    : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:ring-indigo-600"
                }`}
              />
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium opacity-65">Quick Presets:</span>
            <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleSetPreset(0, 5, 0)}
                className={`py-1 px-2 rounded-md border text-center transition-colors ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-200"
                    : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                }`}
              >
                5 min
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(0, 15, 0)}
                className={`py-1 px-2 rounded-md border text-center transition-colors ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-200"
                    : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                }`}
              >
                15 min
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(0, 25, 0)}
                className={`py-1 px-2 rounded-md border text-center transition-colors ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-200"
                    : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                }`}
              >
                25 min
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(1, 0, 0)}
                className={`py-1 px-2 rounded-md border text-center transition-colors ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-200"
                    : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                }`}
              >
                1 hour
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(1, 35, 14)}
                className={`py-1 px-2 rounded-md border text-center font-bold transition-colors ${
                  isDark
                    ? "border-indigo-500/50 bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300"
                    : "border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                }`}
                title="Exact 01:35:14 preset"
              >
                01:35:14
              </button>
              <button
                type="button"
                onClick={handleStartCountUp}
                className={`py-1 px-2 rounded-md border text-center transition-colors flex items-center justify-center gap-1 ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-200"
                    : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                }`}
                title="Count up from 00:00:00"
              >
                <ArrowUpRight size={12} />
                <span>Count Up</span>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-500/20">
            <button
              type="button"
              onClick={handleReset}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDark
                  ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  : "text-zinc-500 hover:text-black hover:bg-zinc-100"
              }`}
              title="Reset to 00:00:00"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-colors"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
