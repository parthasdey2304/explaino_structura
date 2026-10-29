"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Clock,
  ArrowUpRight,
  BellRing,
  Plus,
  Sparkles,
} from "lucide-react";

interface StopwatchProps {
  theme: "light" | "dark";
  className?: string;
  isCompact?: boolean;
}

const STORAGE_KEY = "explaino-stopwatch-state";

// Synthesized audio chime using Web Audio API for timer expiration
function playTimerChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // Harmonic celebration chime (D5 -> F#5 -> A5 -> D6)
    playTone(587.33, now, 0.5);
    playTone(739.99, now + 0.15, 0.6);
    playTone(880.0, now + 0.3, 0.8);
    playTone(1174.66, now + 0.45, 1.2);
  } catch {
    // Autoplay policy or headless environment
  }
}

export default function Stopwatch({
  theme,
  className = "",
  isCompact = false,
}: StopwatchProps) {
  // State: total seconds on the stopwatch / timer
  const [timeInSeconds, setTimeInSeconds] = useState<number>(0);
  const [lastSetDuration, setLastSetDuration] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [mode, setMode] = useState<"countdown" | "countup">("countdown");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showTimesUpModal, setShowTimesUpModal] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Edit fields (strings to allow direct typing of HH, MM, SS)
  const [editHours, setEditHours] = useState<string>("00");
  const [editMinutes, setEditMinutes] = useState<string>("00");
  const [editSeconds, setEditSeconds] = useState<string>("00");

  const popoverRef = useRef<HTMLDivElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);
  const isHydratedRef = useRef<boolean>(false);

  // Load initial state from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.timeInSeconds === "number" && parsed.timeInSeconds >= 0) {
          setTimeInSeconds(parsed.timeInSeconds);
        }
        if (typeof parsed.lastSetDuration === "number" && parsed.lastSetDuration >= 0) {
          setLastSetDuration(parsed.lastSetDuration);
        }
        if (parsed.mode === "countdown" || parsed.mode === "countup") {
          setMode(parsed.mode);
        }
      }
    } catch {
      // Ignore parse errors
    } finally {
      isHydratedRef.current = true;
    }
  }, []);

  // Save state to localStorage (only after initial hydration)
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ timeInSeconds, lastSetDuration, mode })
      );
    } catch {
      // Ignore write errors
    }
  }, [timeInSeconds, lastSetDuration, mode]);

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
            setShowTimesUpModal(true);
            playTimerChime();
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
    setLastSetDuration(total);
    setMode("countdown");
    setIsEditing(false);
  }, [editHours, editMinutes, editSeconds]);

  // Quick preset helper
  const handleSetPreset = (h: number, m: number, s: number = 0) => {
    const total = h * 3600 + m * 60 + s;
    setTimeInSeconds(total);
    setLastSetDuration(total);
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

  // Actions for Time's Up modal
  const handleExtendFiveMinutes = () => {
    setTimeInSeconds(300); // 5 minutes
    setLastSetDuration(300);
    setMode("countdown");
    setIsRunning(true);
    setShowTimesUpModal(false);
  };

  const handleRestartTimer = () => {
    const duration = lastSetDuration > 0 ? lastSetDuration : 300;
    setTimeInSeconds(duration);
    setMode("countdown");
    setIsRunning(true);
    setShowTimesUpModal(false);
  };

  const handleDismissModal = () => {
    setShowTimesUpModal(false);
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
    <>
      <div
        className={`relative inline-flex items-center gap-2 select-none z-20 ${
          isCompact
            ? isDark
              ? "bg-zinc-900/90 border border-zinc-700/80 shadow-2xl backdrop-blur-md px-3.5 py-1 rounded-full"
              : "bg-white/95 border border-zinc-300 shadow-xl backdrop-blur-md px-3.5 py-1 rounded-full"
            : ""
        } ${className}`}
        data-testid="stopwatch-container"
      >
        {/* Clickable time numbers in enlarged bold Orbitron font matching the 3-slash hamburger height */}
        <button
          type="button"
          onClick={handleOpenEdit}
          className={`font-orbitron font-extrabold text-2xl sm:text-[26px] tracking-wider transition-colors duration-150 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 flex items-center leading-none ${
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
            className={`p-1.5 sm:p-2 rounded-lg transition-colors duration-150 flex items-center justify-center focus:outline-none focus:ring-1 ${
              isDark
                ? "text-white hover:bg-white/15 active:bg-white/25 focus:ring-white/30"
                : "text-black hover:bg-black/10 active:bg-black/20 focus:ring-black/20"
            }`}
            title={isRunning ? "Pause" : "Play / Start"}
            aria-label={isRunning ? "Pause stopwatch" : "Start stopwatch"}
          >
            {isRunning ? (
              <Pause size={22} strokeWidth={2.4} fill="currentColor" />
            ) : (
              <Play size={22} strokeWidth={2.4} fill="currentColor" />
            )}
          </button>
        )}

        {/* Time Editor Popover */}
        {isEditing && (
          <div
            ref={popoverRef}
            className={`absolute ${
              isCompact ? "bottom-full mb-3 left-1/2 -translate-x-1/2" : "top-full mt-2 left-0"
            } p-3.5 sm:p-4 rounded-xl shadow-2xl border backdrop-blur-md z-50 flex flex-col gap-3 min-w-[290px] animate-in fade-in zoom-in-95 duration-150 ${
              isDark
                ? "bg-[#18181b]/95 border-zinc-700/80 text-white shadow-black/70"
                : "bg-white/95 border-zinc-200 text-zinc-900 shadow-zinc-400/40"
            }`}
            style={{ minWidth: 290 }}
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
                  onBlur={() =>
                    setEditHours(
                      String(Math.min(99, Math.max(0, parseInt(editHours, 10) || 0))).padStart(2, "0")
                    )
                  }
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
                  onBlur={() =>
                    setEditMinutes(
                      String(Math.min(59, Math.max(0, parseInt(editMinutes, 10) || 0))).padStart(2, "0")
                    )
                  }
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
                  onBlur={() =>
                    setEditSeconds(
                      String(Math.min(59, Math.max(0, parseInt(editSeconds, 10) || 0))).padStart(2, "0")
                    )
                  }
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

      {/* "Time is Up!" Celebration Alert Modal - Rendered via Portal in middle of the page */}
      {mounted && showTimesUpModal && createPortal(
        <div
          id="times-up-modal"
          className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 transition-all ${
            isDark ? "bg-black/45" : "bg-black/[0.15]"
          }`}
          style={{
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="times-up-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismissModal();
          }}
        >
          <div
            className={`w-full max-w-lg min-w-[320px] sm:min-w-[460px] rounded-2xl p-7 sm:p-8 relative overflow-hidden shadow-2xl border transition-all animate-in zoom-in-95 duration-200 ${
              isDark
                ? "bg-zinc-950/95 border-amber-500/40 text-white shadow-[0_0_50px_rgba(245,158,11,0.2)]"
                : "bg-white/95 border-amber-400/50 text-zinc-900 shadow-[0_0_40px_rgba(0,0,0,0.12)]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top radiant glow border */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500" />

            {/* Close button */}
            <button
              type="button"
              onClick={handleDismissModal}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-zinc-500/20 transition-all"
              title="Dismiss"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Content Container */}
            <div className="flex flex-col items-center text-center gap-5">
              {/* Glowing animated celebration icon */}
              <div className="relative mt-1">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-transparent border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <BellRing size={32} className="text-amber-400 animate-bounce" />
                </div>
                <div className="absolute -top-1.5 -right-1.5">
                  <Sparkles size={18} className="text-amber-300 animate-spin" />
                </div>
              </div>

              {/* Title & subtitle */}
              <div>
                <h2
                  id="times-up-title"
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                >
                  Time is Up!
                </h2>
                <p className="text-xs sm:text-sm opacity-75 mt-1.5 max-w-sm">
                  Your scheduled countdown session has completed.
                </p>
              </div>

              {/* Digital Readout Card in Orbitron Font */}
              <div
                className={`w-full py-5 px-6 rounded-xl border flex flex-col items-center justify-center gap-2 ${
                  isDark
                    ? "bg-black/50 border-zinc-800 shadow-inner"
                    : "bg-zinc-100/90 border-zinc-200 shadow-inner"
                }`}
              >
                <div className="font-orbitron font-extrabold text-3xl sm:text-4xl md:text-5xl tracking-widest text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.35)] select-none">
                  00:00:00
                </div>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Session Ended
                </span>
              </div>

              {/* Action Buttons: 3 equal, spacious columns that fit all text perfectly */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleExtendFiveMinutes}
                  className={`px-4 py-3 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    isDark
                      ? "border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 hover:border-zinc-600"
                      : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                  }`}
                  title="Add 5 more minutes and resume"
                >
                  <Plus size={16} />
                  <span>+5 Min</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestartTimer}
                  className={`px-4 py-3 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    isDark
                      ? "border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 hover:border-zinc-600"
                      : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                  }`}
                  title="Restart the previous countdown duration"
                >
                  <RotateCcw size={16} />
                  <span>Restart</span>
                </button>

                <button
                  type="button"
                  onClick={handleDismissModal}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 font-bold text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Check size={17} strokeWidth={2.5} />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
