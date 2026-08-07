/**
 * Visualizer Store - State management for algorithm visualization
 * Using a simple React context-based store (zustand-free alternative)
 */

export interface VariableState {
  name: string;
  value: unknown;
  type: 'primitive' | 'array' | 'object' | 'function';
}

export interface Snapshot {
  lineNumber: number;
  variables: VariableState[];
  code: string;
  description?: string;
}

export interface VisualizerState {
  code: string;
  snapshots: Snapshot[];
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
  error: string | null;
  isRunning: boolean;
}

export type VisualizerAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_SNAPSHOTS'; payload: Snapshot[] }
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
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 1,
  error: null,
  isRunning: false,
};

export function visualizerReducer(
  state: VisualizerState,
  action: VisualizerAction
): VisualizerState {
  switch (action.type) {
    case 'SET_CODE':
      return { ...state, code: action.payload };
    case 'SET_SNAPSHOTS':
      return { ...state, snapshots: action.payload, currentStep: 0, error: null };
    case 'SET_STEP':
      return { ...state, currentStep: Math.max(0, Math.min(action.payload, state.snapshots.length - 1)) };
    case 'STEP_FORWARD':
      return { ...state, currentStep: Math.min(state.currentStep + 1, state.snapshots.length - 1) };
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
      return { ...state, error: action.payload, isRunning: false };
    case 'SET_RUNNING':
      return { ...state, isRunning: action.payload };
    case 'CLEAR':
      return initialVisualizerState;
    default:
      return state;
  }
}
