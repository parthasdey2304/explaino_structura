"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, X } from "lucide-react";
import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";

const STORAGE_KEY = "explaino-explanio-notes-v1";
const MAX_NOTES = 20;

export interface ExplanioNote {
  id: string;
  createdAt: number;
  durationSec: number;
  mimeType: string;
  audio: string;
  peaks: number[];
  /** Canvas scene snapshot captured with the recording (for review). */
  scene: string | null;
}

interface SceneRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Viewport {
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
}

// ── Storage adapter ──────────────────────────────────────────────
// Local cache for now. Firestore (via src/lib/firestore.ts) is the better
// long-term home for these — swap loadNotes/saveNotes to Firestore when
// ready; the note shape already carries everything needed.
function loadNotes(): ExplanioNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is ExplanioNote =>
        !!n && typeof n.id === "string" && typeof n.audio === "string"
    );
  } catch {
    return [];
  }
}

function saveNotes(notes: ExplanioNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.slice(0, MAX_NOTES)));
  } catch {
    // quota — voice notes are best-effort in local cache
  }
}

function nextId(): string {
  return `ex${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** Keep only the elements that intersect the capture region. */
function clipSceneToRegion(sceneJson: string | null, region: SceneRegion): string | null {
  if (!sceneJson) return null;
  try {
    const els = JSON.parse(sceneJson);
    if (!Array.isArray(els)) return sceneJson;
    const kept = els.filter((el) => {
      if (!el || typeof el.x !== "number" || typeof el.y !== "number") return false;
      const w = typeof el.width === "number" ? el.width : 0;
      const h = typeof el.height === "number" ? el.height : 0;
      return el.x < region.maxX && el.x + w > region.minX && el.y < region.maxY && el.y + h > region.minY;
    });
    return JSON.stringify(kept);
  } catch {
    return sceneJson;
  }
}

function Waveform({ peaks, progress = 0 }: { peaks: number[]; progress?: number }) {
  const bars = peaks.length > 0 ? peaks : new Array(32).fill(0.15);
  const shown = bars.slice(0, 64);
  return (
    <div className="explanio__wave" aria-hidden="true">
      {shown.map((p, i) => (
        <span
          key={i}
          className={`explanio__bar${i / shown.length <= progress ? " explanio__bar--played" : ""}`}
          style={{ height: `${Math.max(8, Math.min(100, p * 100))}%` }}
        />
      ))}
    </div>
  );
}

export default function ExplanioPanel({
  onClose,
  getSceneSnapshot,
  viewport,
}: {
  onClose: () => void;
  getSceneSnapshot: () => string | null;
  viewport: Viewport;
}) {
  const [notes, setNotes] = useState<ExplanioNote[]>(() => loadNotes());
  const [region, setRegion] = useState<SceneRegion | null>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const analyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; raf: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (analyserRef.current) {
      cancelAnimationFrame(analyserRef.current.raf);
      void analyserRef.current.ctx.close().catch(() => undefined);
      analyserRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopTracks();
      audioRef.current?.pause();
    },
    [stopTracks]
  );

  const toScene = useCallback(
    (clientX: number, clientY: number) =>
      viewportCoordsToSceneCoords(
        { clientX, clientY },
        viewport as unknown as Parameters<typeof viewportCoordsToSceneCoords>[1]
      ),
    [viewport]
  );

  const toViewport = useCallback(
    (sceneX: number, sceneY: number) =>
      sceneCoordsToViewportCoords(
        { sceneX, sceneY },
        viewport as unknown as Parameters<typeof sceneCoordsToViewportCoords>[1]
      ),
    [viewport]
  );

  const startRecording = useCallback(async () => {
    if (!region) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      peaksRef.current = [];
      setLivePeaks([]);
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const startedAt = Date.now() - recSec * 1000;
        try {
          const audio = await blobToDataUrl(blob);
          const note: ExplanioNote = {
            id: nextId(),
            createdAt: startedAt,
            durationSec: recSec,
            mimeType: blob.type,
            audio,
            peaks: peaksRef.current,
            scene: clipSceneToRegion(getSceneSnapshot(), region),
          };
          setNotes((prev) => [note, ...prev].slice(0, MAX_NOTES));
          setActiveId(note.id);
        } catch {
          setError("Could not save recording (browser storage).");
        }
        stopTracks();
        setRecording(false);
      };
      // Live waveform sampling.
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            const level = Math.min(1, Math.sqrt(sum / data.length) * 3);
            peaksRef.current.push(level);
            if (peaksRef.current.length % 3 === 0) setLivePeaks([...peaksRef.current]);
            analyserRef.current = { ctx, analyser, raf: requestAnimationFrame(tick) };
          };
          tick();
        }
      } catch {
        // waveform is decorative — recording continues without it
      }
      setRecSec(0);
      timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
      rec.start(250);
      setRecording(true);
    } catch {
      setError("Microphone unavailable — allow mic access to record.");
    }
  }, [getSceneSnapshot, recSec, region, stopTracks]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const togglePlay = useCallback(
    (note: ExplanioNote) => {
      const audio = audioRef.current;
      if (playingId === note.id && audio) {
        audio.pause();
        setPlayingId(null);
        return;
      }
      if (audio) audio.pause();
      const next = new Audio(note.audio);
      audioRef.current = next;
      next.ontimeupdate = () => {
        if (next.duration) setProgress(next.currentTime / next.duration);
      };
      next.onended = () => {
        setPlayingId(null);
        setProgress(0);
      };
      setActiveId(note.id);
      setProgress(0);
      setPlayingId(note.id);
      void next.play().catch(() => setPlayingId(null));
    },
    [playingId]
  );

  const removeNote = useCallback(
    (id: string) => {
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
    },
    [playingId]
  );

  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null;

  const onDrawDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrawing({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  }, []);

  const onDrawMove = useCallback(
    (e: React.PointerEvent) => {
      setDrawing((d) => (d ? { ...d, x1: e.clientX, y1: e.clientY } : d));
    },
    []
  );

  const onDrawUp = useCallback(() => {
    setDrawing((d) => {
      if (d) {
        const w = Math.abs(d.x1 - d.x0);
        const h = Math.abs(d.y1 - d.y0);
        if (w > 24 && h > 24) {
          const a = toScene(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
          const b = toScene(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
          setRegion({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y });
        }
      }
      return null;
    });
  }, [toScene]);

  const clearRegion = useCallback(() => {
    if (recording) stopRecording();
    audioRef.current?.pause();
    setPlayingId(null);
    setRegion(null);
  }, [recording, stopRecording]);

  const box = region
    ? {
        left: toViewport(region.minX, region.minY).x,
        top: toViewport(region.minX, region.minY).y,
        right: toViewport(region.maxX, region.maxY).x,
        bottom: toViewport(region.maxX, region.maxY).y,
      }
    : null;

  const draft = drawing
    ? {
        left: Math.min(drawing.x0, drawing.x1),
        top: Math.min(drawing.y0, drawing.y1),
        width: Math.abs(drawing.x1 - drawing.x0),
        height: Math.abs(drawing.y1 - drawing.y0),
      }
    : null;

  return (
    <>
      {/* Draw-a-rectangle step: transparent capture layer over the canvas. */}
      {!region && (
        <div
          className="explanio-draw"
          onPointerDown={onDrawDown}
          onPointerMove={onDrawMove}
          onPointerUp={onDrawUp}
        >
          <div className="explanio-draw__hint">
            Drag on the canvas to mark the capture rectangle
            <button type="button" className="explanio-draw__close" onClick={onClose} aria-label="Close Explanio">
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>
          {draft && (
            <div
              className="explanio-region explanio-region--draft"
              style={{ left: draft.left, top: draft.top, width: draft.width, height: draft.height }}
            />
          )}
        </div>
      )}

      {/* Capture rectangle + anchored controls (hidden when Explanio is closed). */}
      {region && box && (
        <>
          <div
            className="explanio-region"
            style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
          />
          {/* Listener side — top right of the rectangle */}
          <div className="explanio-dock explanio-dock--listen" style={{ left: box.right - 232, top: box.top - 58 }}>
            {active ? (
              <div className="explanio__player explanio__player--dock">
                <button
                  type="button"
                  className="explanio__play"
                  onClick={() => togglePlay(active)}
                  title={playingId === active.id ? "Pause" : "Play"}
                  aria-label={playingId === active.id ? "Pause" : "Play"}
                >
                  {playingId === active.id ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <div className="explanio__player-main">
                  <Waveform peaks={active.peaks} progress={playingId === active.id ? progress : 0} />
                  <div className="explanio__meta">{fmtTime(active.durationSec)}</div>
                </div>
                <button
                  type="button"
                  className="explanio__delete"
                  onClick={() => removeNote(active.id)}
                  title="Delete note"
                  aria-label="Delete note"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <div className="explanio__empty">No voice notes yet.</div>
            )}
            {notes.length > 1 && (
              <div className="explanio__list">
                {notes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`explanio__chip${n.id === active?.id ? " explanio__chip--active" : ""}`}
                    onClick={() => {
                      audioRef.current?.pause();
                      setPlayingId(null);
                      setActiveId(n.id);
                    }}
                  >
                    {fmtTime(n.durationSec)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Recorder side — bottom right of the rectangle */}
          <div className="explanio-dock explanio-dock--record" style={{ left: box.right - 232, top: box.bottom + 10 }}>
            <button
              type="button"
              className={`explanio__rec${recording ? " explanio__rec--on" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              title={recording ? "Stop recording" : "Start recording"}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              {recording ? <Square size={13} /> : <Mic size={14} />}
            </button>
            <div className="explanio__rec-main">
              {recording ? (
                <>
                  <Waveform peaks={livePeaks} />
                  <div className="explanio__meta explanio__meta--rec">● {fmtTime(recSec)}</div>
                </>
              ) : (
                <div className="explanio__empty">Tap mic to add a voice note.</div>
              )}
            </div>
            <button
              type="button"
              className="explanio__delete"
              onClick={clearRegion}
              title="Clear rectangle"
              aria-label="Clear rectangle"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
            {error && <div className="explanio__error">{error}</div>}
          </div>
        </>
      )}
    </>
  );
}
