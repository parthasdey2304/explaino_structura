/**
 * Editor settings — small, synchronous, localStorage-backed toggles for
 * features that used to be all-or-nothing: snippet/Emmet expansion, the
 * sandboxed terminal, and the AI assistant.
 *
 * Kept deliberately tiny (no context provider, no store library) since it's
 * read from a hot path — a CodeMirror keymap handler that runs on every
 * Tab press — and written to from one settings dropdown. A module-level
 * cache plus a `window` CustomEvent (mirroring the app's existing
 * `explaino:*` event pattern) keeps every consumer in sync without prop
 * drilling through the whole panel tree.
 */

export interface EditorSettings {
  emmetEnabled: boolean;
  terminalEnabled: boolean;
  aiEnabled: boolean;
}

const STORAGE_KEY = "explaino-editor-settings-v1";
const EVENT_NAME = "explaino:editor-settings-changed";

const DEFAULTS: EditorSettings = {
  emmetEnabled: true,
  terminalEnabled: true,
  aiEnabled: true,
};

let cache: EditorSettings | null = null;

function readFromStorage(): EditorSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      emmetEnabled: typeof parsed.emmetEnabled === "boolean" ? parsed.emmetEnabled : DEFAULTS.emmetEnabled,
      terminalEnabled: typeof parsed.terminalEnabled === "boolean" ? parsed.terminalEnabled : DEFAULTS.terminalEnabled,
      aiEnabled: typeof parsed.aiEnabled === "boolean" ? parsed.aiEnabled : DEFAULTS.aiEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Current settings, synchronously. Safe to call from a hot path. */
export function getEditorSettings(): EditorSettings {
  if (!cache) cache = readFromStorage();
  return cache;
}

/** Patch one or more settings and notify every listener. */
export function setEditorSettings(patch: Partial<EditorSettings>): EditorSettings {
  const next = { ...getEditorSettings(), ...patch };
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota errors ignored — settings just won't persist across reloads
  }
  window.dispatchEvent(new CustomEvent<EditorSettings>(EVENT_NAME, { detail: next }));
  return next;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function subscribeEditorSettings(listener: (settings: EditorSettings) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<EditorSettings>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
