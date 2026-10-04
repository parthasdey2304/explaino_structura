"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, X } from "lucide-react";

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
}: {
  onClose: () => void;
  getSceneSnapshot: () => string | null;
}) {
  const [notes, setNotes] = useState<ExplanioNote[]>(() => loadNotes());
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

  const startRecording = useCallback(async () => {
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
            scene: getSceneSnapshot(),
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
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
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
  }, [getSceneSnapshot, recSec, stopTracks]);

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

  return (
    <div className="explanio-panel excalidraw-island" role="dialog" aria-label="Explanio voice notes">
      <div className="explanio-panel__header">
        <span className="explanio-panel__title">
          <Mic size={14} strokeWidth={2.2} />
          Explanio
        </span>
        <button type="button" className="explanio-panel__close" onClick={onClose} title="Close" aria-label="Close Explanio">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Listener side — playback + waveform */}
      <div className="explanio__section">
        <div className="explanio__section-label">Listen</div>
        {active ? (
          <div className="explanio__player">
            <button
              type="button"
              className="explanio__play"
              onClick={() => togglePlay(active)}
              title={playingId === active.id ? "Pause" : "Play"}
              aria-label={playingId === active.id ? "Pause" : "Play"}
            >
              {playingId === active.id ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="explanio__player-main">
              <Waveform peaks={active.peaks} progress={playingId === active.id ? progress : 0} />
              <div className="explanio__meta">
                {fmtTime(active.durationSec)} · {new Date(active.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              className="explanio__delete"
              onClick={() => removeNote(active.id)}
              title="Delete note"
              aria-label="Delete note"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <div className="explanio__empty">No voice notes yet — record one below.</div>
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

      {/* Recorder side — add something */}
      <div className="explanio__section">
        <div className="explanio__section-label">Record</div>
        <div className="explanio__rec-row">
          <button
            type="button"
            className={`explanio__rec${recording ? " explanio__rec--on" : ""}`}
            onClick={recording ? stopRecording : startRecording}
            title={recording ? "Stop recording" : "Start recording"}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            {recording ? <Square size={14} /> : <Mic size={15} />}
          </button>
          <div className="explanio__rec-main">
            {recording ? (
              <>
                <Waveform peaks={livePeaks} />
                <div className="explanio__meta explanio__meta--rec">● {fmtTime(recSec)} — capturing voice + canvas</div>
              </>
            ) : (
              <div className="explanio__empty">Tap the mic to add a voice note.</div>
            )}
          </div>
        </div>
        {error && <div className="explanio__error">{error}</div>}
      </div>
    </div>
  );
}
