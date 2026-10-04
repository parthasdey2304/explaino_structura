"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, X } from "lucide-react";
import {
  exportToCanvas,
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadString } from "firebase/storage";

const STORAGE_KEY = "explaino-explanio-notes-v1";
const MAX_NOTES = 20;
// Keep total stored JSON safely under the ~5MB localStorage quota so notes
// always survive a reload. Frames are shed first, then scenes, then old notes.
const STORE_BUDGET = 4_000_000;

export interface ExplanioFrame {
  /** Seconds since recording start. */
  t: number;
  /** Small PNG thumbnail of the region at time t. */
  img: string;
  /** Content bounding box (scene coords) of this frame. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface ExplanioNote {
  id: string;
  createdAt: number;
  durationSec: number;
  mimeType: string;
  audio: string;
  peaks: number[];
  /** Canvas scene snapshot captured with the recording (for review). */
  scene: string | null;
  /** Playback-synced thumbnails of shapes drawn inside the region. */
  frames: ExplanioFrame[];
  /** Capture rectangle in scene coords — pointwise canvas placement for recall. */
  region: SceneRegion | null;
  /** True once metadata + media live in Firebase. */
  cloud: boolean;
}

const CLOUD_COLLECTION = "explanio_notes";

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
    return parsed
      .filter(
        (n): n is ExplanioNote =>
          !!n && typeof n.id === "string" && typeof n.audio === "string"
      )
      .map((n) => ({
        ...n,
        frames: Array.isArray(n.frames) ? n.frames : [],
        region: n.region ?? null,
        cloud: n.cloud ?? false,
      }));
  } catch {
    return [];
  }
}

function saveNotes(notes: ExplanioNote[]): { kept: ExplanioNote[]; trimmed: boolean } {
  const fitted = notes.slice(0, MAX_NOTES).map((n) => ({ ...n, frames: [...n.frames] }));
  const size = () => JSON.stringify(fitted).length;
  let trimmed = false;
  // 1. Shed replay thumbnails from the oldest notes first.
  for (let i = fitted.length - 1; i >= 0 && size() > STORE_BUDGET; i--) {
    while (fitted[i].frames.length > 0 && size() > STORE_BUDGET) {
      const f = fitted[i].frames;
      fitted[i] = { ...fitted[i], frames: f.filter((_, j) => j % 2 === 0).slice(0, Math.max(1, f.length >> 1)) };
      trimmed = true;
    }
  }
  // 2. Drop scene snapshots, oldest first.
  for (let i = fitted.length - 1; i >= 0 && size() > STORE_BUDGET; i--) {
    if (fitted[i].scene) {
      fitted[i] = { ...fitted[i], scene: null };
      trimmed = true;
    }
  }
  // 3. Drop oldest notes entirely.
  while (fitted.length > 1 && size() > STORE_BUDGET) {
    fitted.pop();
    trimmed = true;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fitted));
  return { kept: fitted, trimmed };
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
function clipElementsToRegion(
  els: unknown,
  region: SceneRegion
): Record<string, unknown>[] {
  if (!Array.isArray(els)) return [];
  return (els as Record<string, unknown>[]).filter((el) => {
    if (!el || el.isDeleted) return false;
    if (typeof el.x !== "number" || typeof el.y !== "number") return false;
    const w = typeof el.width === "number" ? el.width : 0;
    const h = typeof el.height === "number" ? el.height : 0;
    return el.x < region.maxX && el.x + w > region.minX && el.y < region.maxY && el.y + h > region.minY;
  });
}

/** Keep only the elements that intersect the capture region. */
function clipSceneToRegion(sceneJson: string | null, region: SceneRegion): string | null {
  if (!sceneJson) return null;
  try {
    const els = JSON.parse(sceneJson);
    if (!Array.isArray(els)) return sceneJson;
    return JSON.stringify(clipElementsToRegion(els, region));
  } catch {
    return sceneJson;
  }
}

const MAX_FRAME_THUMBS = 10;

/** Render small PNG thumbnails for evenly sampled frames. */
async function buildFrameThumbs(
  frames: { t: number; elements: Record<string, unknown>[] }[],
  files: unknown,
  dark: boolean
): Promise<ExplanioFrame[]> {
  if (frames.length === 0) return [];
  const step = Math.max(1, Math.floor(frames.length / MAX_FRAME_THUMBS));
  const sampled = frames.filter((_, i) => i % step === 0).slice(0, MAX_FRAME_THUMBS);
  const out: ExplanioFrame[] = [];
  for (const f of sampled) {
    try {
      // Bake the theme appearance in: dark-mode strokes are stored inverted
      // (the canvas CSS filter un-inverts them), so export explicitly in the
      // current theme or the replay renders near-invisible.
      const canvas = await exportToCanvas({
        elements: f.elements,
        appState: {
          viewBackgroundColor: dark ? "#121212" : "#ffffff",
          exportBackground: true,
          exportWithDarkMode: dark,
        },
        files,
        // High enough resolution that upscaling to the region stays crisp.
        maxWidthOrHeight: 880,
        exportPadding: 0,
      } as unknown as Parameters<typeof exportToCanvas>[0]);
      out.push({ t: f.t, img: canvas.toDataURL("image/png"), bbox: contentBBox(f.elements) });
    } catch {
      // skip frames that fail to render
    }
  }
  return out;
}

function contentBBox(
  elements: Record<string, unknown>[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (typeof el.x !== "number" || typeof el.y !== "number") continue;
    const w = typeof el.width === "number" ? el.width : 0;
    const h = typeof el.height === "number" ? el.height : 0;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + w);
    maxY = Math.max(maxY, el.y + h);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function Waveform({ peaks, progress = 0 }: { peaks: number[]; progress?: number }) {
  const bars = peaks.length > 0 ? peaks : new Array(32).fill(0.15);
  // Cap bar count so the strip never stretches outside its dock.
  const shown = bars.length > 40 ? bars.filter((_, i) => i % Math.ceil(bars.length / 40) === 0).slice(0, 40) : bars;
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
  getSceneData,
  viewport,
}: {
  onClose: () => void;
  getSceneSnapshot: () => string | null;
  getSceneData: () => { elements: unknown[]; files: unknown } | null;
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
  const [curTime, setCurTime] = useState(0);
  const [frame, setFrame] = useState<ExplanioFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storageTight, setStorageTight] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [cloudError, setCloudError] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const framesRef = useRef<{ t: number; elements: Record<string, unknown>[] }[]>([]);
  const analyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; raf: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const { kept, trimmed } = saveNotes(notes);
      setStorageTight(trimmed);
      if (kept.length < notes.length) {
        // Storage could not hold everything — keep state identical to disk
        // so a reload shows exactly what is here now.
        setNotes(kept);
      }
    } catch {
      setError("Browser storage is full — this note will vanish on reload. Delete old notes.");
    }
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

  // ── Firebase split storage ───────────────────────────────────
  // Cache (localStorage): lightweight metadata + region only.
  // Firebase: audio bytes + frames in Storage, doc in Firestore.
  const syncNoteToCloud = useCallback(async (note: ExplanioNote, audioBlob: Blob) => {
    setSyncing((s) => ({ ...s, [note.id]: true }));
    try {
      await uploadBytes(ref(storage, `explanio/${note.id}/audio`), audioBlob, {
        contentType: note.mimeType || "audio/webm",
      });
      await uploadString(
        ref(storage, `explanio/${note.id}/frames.json`),
        JSON.stringify(note.frames),
        "raw",
        { contentType: "application/json" }
      );
      await setDoc(doc(db, CLOUD_COLLECTION, note.id), {
        createdAt: note.createdAt,
        durationSec: note.durationSec,
        mimeType: note.mimeType,
        peaks: note.peaks.slice(0, 200),
        region: note.region,
      });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, cloud: true } : n)));
    } catch {
      // Offline or rules deny — note stays local-only, still playable here.
      setCloudError(true);
    } finally {
      setSyncing((s) => {
        const next = { ...s };
        delete next[note.id];
        return next;
      });
    }
  }, []);

  // Pull cloud notes on open; merge with local (local wins on conflict).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, CLOUD_COLLECTION), orderBy("createdAt", "desc"), limit(20))
        );
        if (cancelled) return;
        const cloudNotes: ExplanioNote[] = snap.docs.map((d) => {
          const v = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
            durationSec: typeof v.durationSec === "number" ? v.durationSec : 0,
            mimeType: typeof v.mimeType === "string" ? v.mimeType : "audio/webm",
            audio: "",
            peaks: Array.isArray(v.peaks) ? (v.peaks as number[]) : [],
            scene: null,
            frames: [],
            region: (v.region as SceneRegion | null) ?? null,
            cloud: true,
          };
        });
        setNotes((prev) => {
          const ids = new Set(prev.map((n) => n.id));
          const merged = [...prev];
          for (const c of cloudNotes) {
            if (!ids.has(c.id)) merged.push(c);
            else {
              const i = merged.findIndex((n) => n.id === c.id);
              merged[i] = { ...merged[i], cloud: true, region: merged[i].region ?? c.region };
            }
          }
          return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_NOTES);
        });
      } catch {
        // Cloud unreachable — local cache still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Download a cloud note's media before first play. */
  const ensureMedia = useCallback(async (note: ExplanioNote): Promise<ExplanioNote | null> => {
    if (note.audio) return note;
    try {
      const [audioUrl, framesUrl] = await Promise.all([
        getDownloadURL(ref(storage, `explanio/${note.id}/audio`)),
        getDownloadURL(ref(storage, `explanio/${note.id}/frames.json`)),
      ]);
      const [audioRes, framesRes] = await Promise.all([fetch(audioUrl), fetch(framesUrl)]);
      const blob = await audioRes.blob();
      const audio = await blobToDataUrl(blob);
      const frames = (await framesRes.json()) as ExplanioFrame[];
      let merged: ExplanioNote | null = null;
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== note.id) return n;
          merged = { ...n, audio, frames: Array.isArray(frames) ? frames : [] };
          return merged;
        })
      );
      return merged ?? { ...note, audio, frames: Array.isArray(frames) ? frames : [] };
    } catch {
      setError("Could not download this note — check connection.");
      return null;
    }
  }, []);

  const captureFrame = useCallback(
    (atSec: number) => {
      if (!region) return;
      const data = getSceneData();
      if (!data) return;
      framesRef.current.push({
        t: atSec,
        elements: clipElementsToRegion(data.elements, region),
      });
      if (framesRef.current.length > 120) framesRef.current.shift();
    },
    [getSceneData, region]
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
          const data = getSceneData();
          const dark =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("theme-dark");
          const frames = await buildFrameThumbs(framesRef.current, data?.files ?? {}, dark);
          const note: ExplanioNote = {
            id: nextId(),
            createdAt: startedAt,
            durationSec: recSec,
            mimeType: blob.type,
            audio,
            peaks: peaksRef.current,
            scene: clipSceneToRegion(getSceneSnapshot(), region),
            frames,
            region,
            cloud: false,
          };
          setNotes((prev) => [note, ...prev].slice(0, MAX_NOTES));
          setActiveId(note.id);
          void syncNoteToCloud(note, blob);
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
      framesRef.current = [];
      captureFrame(0);
      timerRef.current = setInterval(() => {
        setRecSec((s) => {
          captureFrame(s + 1);
          return s + 1;
        });
      }, 1000);
      rec.start(250);
      setRecording(true);
    } catch {
      setError("Microphone unavailable — allow mic access to record.");
    }
  }, [captureFrame, getSceneData, getSceneSnapshot, recSec, region, stopTracks]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const togglePlay = useCallback(
    async (note: ExplanioNote) => {
      const audio = audioRef.current;
      if (playingId === note.id && audio) {
        audio.pause();
        setPlayingId(null);
        return;
      }
      if (audio) audio.pause();
      const ready = await ensureMedia(note);
      if (!ready || !ready.audio) return;
      // Position-aware recall: jump the docks to where this note was recorded.
      if (ready.region) setRegion(ready.region);
      const next = new Audio(ready.audio);
      audioRef.current = next;
      const frames = ready.frames;
      const pickFrame = () => {
        if (frames.length === 0) {
          setFrame(null);
          return;
        }
        const t = next.currentTime;
        let best = frames[0];
        for (const f of frames) {
          if (f.t <= t) best = f;
          else break;
        }
        setFrame((prev) => (prev?.img === best.img ? prev : best));
      };
      next.ontimeupdate = () => {
        if (next.duration) setProgress(next.currentTime / next.duration);
        setCurTime(next.currentTime);
        pickFrame();
      };
      next.onended = () => {
        setPlayingId(null);
        setProgress(0);
        setCurTime(0);
      };
      next.onseeked = pickFrame;
      setActiveId(ready.id);
      setProgress(0);
      setCurTime(0);
      setPlayingId(ready.id);
      pickFrame();
      void next.play().catch(() => setPlayingId(null));
    },
    [ensureMedia, playingId]
  );

  /** Click/drag on the waveform to seek back and forth. */
  const seekTo = useCallback(
    (e: React.PointerEvent, note: ExplanioNote) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration || playingId !== note.id) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      audio.currentTime = ratio * audio.duration;
      setProgress(ratio);
      setCurTime(audio.currentTime);
    },
    [playingId]
  );

  const removeNote = useCallback(
    (id: string) => {
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
        setFrame(null);
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
      // Best-effort cloud cleanup (keeps Firebase space minimal).
      void (async () => {
        try {
          await deleteDoc(doc(db, CLOUD_COLLECTION, id));
        } catch {
          // already gone or offline — local delete stands
        }
        for (const p of [`explanio/${id}/audio`, `explanio/${id}/frames.json`]) {
          try {
            await deleteObject(ref(storage, p));
          } catch {
            // ignore
          }
        }
      })();
    },
    [playingId]
  );

  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null;
  const replaying = playingId !== null && (active?.frames.length ?? 0) > 0 && active?.id === playingId;

  const replayRef = useRef<HTMLCanvasElement | null>(null);
  const replayImgRef = useRef<HTMLImageElement | null>(null);

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

  // Docks zoom with the canvas (clamped so they stay usable at extremes).
  const zoomScale = Math.max(0.5, Math.min(1.5, viewport.zoom.value || 1));

  // Draw the current replay frame onto the region overlay canvas,
  // mapping the frame's scene-space bbox onto the region's screen rect
  // (uniform zoom — axes and pixels stay true, no distortion).
  useEffect(() => {
    const canvas = replayRef.current;
    if (!canvas || !region || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, box.right - box.left);
    const h = Math.max(1, box.bottom - box.top);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!replaying || !frame) return;
    const zoom = w / Math.max(1, region.maxX - region.minX);
    const img = new Image();
    img.onload = () => {
      const c = replayRef.current;
      if (!c || !region) return;
      const cc = c.getContext("2d");
      if (!cc) return;
      const d = window.devicePixelRatio || 1;
      cc.setTransform(d, 0, 0, d, 0, 0);
      const fx = (frame.bbox.minX - region.minX) * zoom;
      const fy = (frame.bbox.minY - region.minY) * zoom;
      const fw = Math.max(1, (frame.bbox.maxX - frame.bbox.minX) * zoom);
      const fh = Math.max(1, (frame.bbox.maxY - frame.bbox.minY) * zoom);
      cc.clearRect(0, 0, w, h);
      cc.drawImage(img, fx, fy, fw, fh);
    };
    img.src = frame.img;
    replayImgRef.current = img;
  }, [box, region, frame, replaying]);

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
            className={`explanio-region${replaying ? " explanio-region--playing" : ""}`}
            style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
          />
          {/* Drawing replay — renders inside the rectangle, synced to the voice. */}
          {replaying && (
            <canvas
              ref={replayRef}
              className="explanio-replay"
              style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
            />
          )}
          {/* Listener side — top right of the rectangle */}
          <div
            className="explanio-dock explanio-dock--listen"
            style={{ left: box.right, top: box.top, transform: `scale(${zoomScale}) translate(-100%, -100%)` }}
          >
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
                  <div
                    className="explanio__seek"
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(active.durationSec)}
                    aria-valuenow={Math.round(playingId === active.id ? curTime : 0)}
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      seekTo(e, active);
                    }}
                    onPointerMove={(e) => {
                      if (e.buttons > 0) seekTo(e, active);
                    }}
                    title="Click or drag to seek"
                  >
                    <Waveform peaks={active.peaks} progress={playingId === active.id ? progress : 0} />
                  </div>
                  <div className="explanio__meta">
                    {playingId === active.id
                      ? `${fmtTime(curTime)} / ${fmtTime(active.durationSec)}`
                      : fmtTime(active.durationSec)}
                    {syncing[active.id] ? " · syncing…" : active.cloud ? " · cloud" : " · local"}
                  </div>
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
                      setFrame(null);
                      setActiveId(n.id);
                      // Position-aware recall: jump to where it was recorded.
                      if (n.region) setRegion(n.region);
                    }}
                  >
                    {fmtTime(n.durationSec)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Recorder side — bottom right of the rectangle */}
          <div
            className="explanio-dock explanio-dock--record"
            style={{ left: box.right, top: box.bottom, transform: `scale(${zoomScale}) translate(-100%, 10px)` }}
          >
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
            {!error && cloudError && (
              <div className="explanio__meta">Cloud unreachable — notes stay in local cache.</div>
            )}
            {!error && storageTight && (
              <div className="explanio__meta">Storage nearly full — oldest replays trimmed to keep notes saved.</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
