/**
 * Visualizer store — playback state for the on-canvas algorithm visualizer.
 * A plain reducer so the widget can own its own state without pulling in a
 * store library.
 */

export interface VariableState {
  name: string;
  value: unknown;
  type: 'primitive' | 'array' | 'object' | 'function';
}

export interface Snapshot {
  /** 1-based source line that is about to execute. */
  lineNumber: number;
  variables: VariableState[];
  /** The original (uninstrumented) source, for the code view. */
  code: string;
  /**
   * How many console lines had been printed when this step was reached.
   * The widget slices the trace's stdout to this length so output appears
   * progressively during playback instead of all at once.
   */
  outIndex: number;
  description?: string;
}

export interface VisualizerState {
  code: string;
  snapshots: Snapshot[];
  /** Full console output for the whole run. */
  stdout: string[];
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
  error: string | null;
  isRunning: boolean;
  /** Set when a step/time budget cut the trace short. */
  truncated: boolean;
}

export type VisualizerAction =
  | { type: 'SET_CODE'; payload: string }
  | {
      type: 'SET_TRACE';
      payload: { snapshots: Snapshot[]; stdout: string[]; truncated: boolean };
    }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'STEP_FORWARD' }
  | { type: 'STEP_BACK' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'RESET' }
  | { type: 'SET_SPEED'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RUNNING'; payload: boolean }
  | { type: 'CLEAR' };

export const initialVisualizerState: VisualizerState = {
  code: '',
  snapshots: [],
  stdout: [],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 1,
  error: null,
  isRunning: false,
  truncated: false,
};

const lastIndex = (state: VisualizerState) => Math.max(0, state.snapshots.length - 1);

export function visualizerReducer(
  state: VisualizerState,
  action: VisualizerAction
): VisualizerState {
  switch (action.type) {
    case 'SET_CODE':
      return { ...state, code: action.payload };
    case 'SET_TRACE':
      return {
        ...state,
        snapshots: action.payload.snapshots,
        stdout: action.payload.stdout,
        truncated: action.payload.truncated,
        currentStep: 0,
        isPlaying: false,
      };
    case 'SET_STEP':
      return {
        ...state,
        currentStep: Math.max(0, Math.min(action.payload, lastIndex(state))),
      };
    case 'STEP_FORWARD':
      return { ...state, currentStep: Math.min(state.currentStep + 1, lastIndex(state)) };
    case 'STEP_BACK':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0) };
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'RESET':
      return { ...state, currentStep: 0, isPlaying: false };
    case 'SET_SPEED':
      return { ...state, playbackSpeed: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isRunning: false, isPlaying: false };
    case 'SET_RUNNING':
      return { ...state, isRunning: action.payload };
    case 'CLEAR':
      return initialVisualizerState;
    default:
      return state;
  }
}
