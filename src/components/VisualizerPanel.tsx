"use client";

import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { X, Play, Pause, SkipBack, SkipForward, RotateCcw, ChevronRight } from "lucide-react";
import { 
  visualizerReducer, 
  initialVisualizerState, 
  type Snapshot,
  type VariableState 
} from "@/lib/visualizerStore";
import { traceJavaScript } from "@/lib/instrumentation";

interface VisualizerPanelProps {
  code: string;
  onClose: () => void;
  highlightLine?: (line: number) => void;
}

// ── Memory Block Component ────────────────────────────────────────────────
function MemoryBlock({ 
  name, 
  value, 
  type, 
  isActive = false,
  index 
}: { 
  name: string; 
  value: unknown; 
  type: string;
  isActive?: boolean;
  index?: number;
}) {
  const displayValue = () => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (type === 'array') {
      const arr = value as unknown[];
      return `[${arr.slice(0, 5).map(v => 
        typeof v === 'string' ? `"${v}"` : String(v)
      ).join(', ')}${arr.length > 5 ? '...' : ''}]`;
    }
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  };

  return (
    <div className={`memory-block ${isActive ? 'memory-block--active' : ''}`}>
      <div className="memory-block__header">
        <span className="memory-block__name">{name}</span>
        {index !== undefined && (
          <span className="memory-block__index">[{index}]</span>
        )}
      </div>
      <div className="memory-block__value">
        {type === 'array' ? (
          <ArrayVisualizer name={name} value={value as unknown[]} />
        ) : (
          <span className="memory-block__primitive">{displayValue()}</span>
        )}
      </div>
    </div>
  );
}

// ── Array Visualizer Component ─────────────────────────────────────────────
function ArrayVisualizer({ name, value }: { name: string; value: unknown[] }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <span className="memory-block__primitive">[]</span>;
  }

  return (
    <div className="array-visualizer">
      <div className="array-visualizer__cells">
        {value.slice(0, 10).map((item, i) => (
          <div key={i} className="array-cell">
            <span className="array-cell__index">{i}</span>
            <span className="array-cell__value">
              {typeof item === 'string' ? `"${item}"` : String(item)}
            </span>
          </div>
        ))}
        {value.length > 10 && (
          <div className="array-cell array-cell--more">
            +{value.length - 10} more
          </div>
        )}
      </div>
    </div>
  );
}

// ── Object Visualizer Component ────────────────────────────────────────────
function ObjectVisualizer({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).slice(0, 5);
  
  return (
    <div className="object-visualizer">
      {entries.map(([key, val]) => (
        <div key={key} className="object-entry">
          <span className="object-entry__key">{key}:</span>
          <span className="object-entry__value">
            {typeof val === 'string' ? `"${val}"` : String(val)}
          </span>
        </div>
      ))}
      {Object.keys(value).length > 5 && (
        <div className="object-entry object-entry--more">
          +{Object.keys(value).length - 5} more properties
        </div>
      )}
    </div>
  );
}

// ── Variable Card Component ────────────────────────────────────────────────
function VariableCard({ variable }: { variable: VariableState }) {
  const { name, value, type } = variable;
  
  return (
    <div className="variable-card">
      <div className="variable-card__header">
        <span className="variable-card__type-badge">{type}</span>
        <span className="variable-card__name">{name}</span>
      </div>
      <div className="variable-card__value-container">
        {type === 'array' && Array.isArray(value) ? (
          <ArrayVisualizer name={name} value={value} />
        ) : type === 'object' && value !== null && typeof value === 'object' ? (
          <ObjectVisualizer value={value as Record<string, unknown>} />
        ) : (
          <span className="variable-card__primitive">
            {value === null ? 'null' : value === undefined ? 'undefined' : String(value)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Visualizer Panel ──────────────────────────────────────────────────
export default function VisualizerPanel({ code, onClose, highlightLine }: VisualizerPanelProps) {
  const [state, dispatch] = useReducer(visualizerReducer, initialVisualizerState);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Execute code and generate snapshots when code changes
  useEffect(() => {
    const runCode = async () => {
      dispatch({ type: 'SET_RUNNING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const result = await traceJavaScript(code);

      dispatch({
        type: 'SET_TRACE',
        payload: {
          snapshots: result.snapshots,
          stdout: result.stdout,
          truncated: result.truncated,
        },
      });
      dispatch({ type: 'SET_ERROR', payload: result.error });

      dispatch({ type: 'SET_RUNNING', payload: false });
    };
    
    if (code.trim()) {
      runCode();
    }
  }, [code]);

  // Handle playback
  useEffect(() => {
    if (state.isPlaying && state.snapshots.length > 0) {
      const interval = 1000 / state.playbackSpeed;
      playbackIntervalRef.current = setInterval(() => {
        dispatch({ type: 'STEP_FORWARD' });
      }, interval);
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }
    
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [state.isPlaying, state.playbackSpeed, state.snapshots.length]);

  // Stop at the end
  useEffect(() => {
    if (state.currentStep >= state.snapshots.length - 1 && state.isPlaying) {
      dispatch({ type: 'PAUSE' });
    }
  }, [state.currentStep, state.snapshots.length, state.isPlaying]);

  // Highlight current line
  useEffect(() => {
    if (state.snapshots.length > 0 && highlightLine) {
      const currentSnapshot = state.snapshots[state.currentStep];
      if (currentSnapshot) {
        highlightLine(currentSnapshot.lineNumber);
      }
    }
  }, [state.currentStep, state.snapshots, highlightLine]);

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) {
      dispatch({ type: 'PAUSE' });
    } else {
      if (state.currentStep >= state.snapshots.length - 1) {
        dispatch({ type: 'RESET' });
      }
      dispatch({ type: 'PLAY' });
    }
  }, [state.isPlaying, state.currentStep, state.snapshots.length]);

  const handleStepForward = useCallback(() => {
    dispatch({ type: 'PAUSE' });
    dispatch({ type: 'STEP_FORWARD' });
  }, []);

  const handleStepBack = useCallback(() => {
    dispatch({ type: 'PAUSE' });
    dispatch({ type: 'STEP_BACK' });
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    dispatch({ type: 'SET_SPEED', payload: speed });
  }, []);

  const currentSnapshot: Snapshot | null = state.snapshots[state.currentStep] || null;

  return (
    <div className="visualizer-panel excalidraw-island">
      {/* Header */}
      <div className="visualizer-panel__header">
        <div className="visualizer-panel__header-left">
          <span className="visualizer-panel__title">Algorithm Visualizer</span>
          <span className="visualizer-panel__step-badge">
            Step {state.snapshots.length > 0 ? state.currentStep + 1 : 0} / {state.snapshots.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="tool-icon-btn"
          style={{ width: "1.75rem", height: "1.75rem" }}
          title="Close"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Playback Controls */}
      <div className="visualizer-panel__controls">
        <button
          type="button"
          onClick={handleStepBack}
          disabled={state.currentStep === 0 || state.snapshots.length === 0}
          className="visualizer-btn"
          title="Step Back"
        >
          <SkipBack size={16} />
        </button>
        
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={state.snapshots.length === 0 || state.isRunning}
          className="visualizer-btn visualizer-btn--primary"
          title={state.isPlaying ? "Pause" : "Play"}
        >
          {state.isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        
        <button
          type="button"
          onClick={handleStepForward}
          disabled={state.currentStep >= state.snapshots.length - 1 || state.snapshots.length === 0}
          className="visualizer-btn"
          title="Step Forward"
        >
          <SkipForward size={16} />
        </button>
        
        <button
          type="button"
          onClick={handleReset}
          disabled={state.snapshots.length === 0}
          className="visualizer-btn"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>

        <div className="visualizer-panel__speed">
          <label className="visualizer-panel__speed-label">Speed:</label>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={state.playbackSpeed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            className="visualizer-panel__speed-slider"
          />
          <span className="visualizer-panel__speed-value">{state.playbackSpeed}x</span>
        </div>
      </div>

      {/* Step Progress Bar */}
      {state.snapshots.length > 0 && (
        <div className="visualizer-panel__progress">
          <input
            type="range"
            min="0"
            max={state.snapshots.length - 1}
            value={state.currentStep}
            onChange={(e) => dispatch({ type: 'SET_STEP', payload: parseInt(e.target.value) })}
            className="visualizer-panel__progress-slider"
          />
        </div>
      )}

      {/* Content */}
      <div className="visualizer-panel__content">
        {state.isRunning && (
          <div className="visualizer-panel__loading">
            <div className="visualizer-panel__spinner" />
            <span>Analyzing code...</span>
          </div>
        )}

        {state.error && (
          <div className="visualizer-panel__error">
            <span className="visualizer-panel__error-icon">✗</span>
            <span className="visualizer-panel__error-message">{state.error}</span>
          </div>
        )}

        {!state.isRunning && !state.error && state.snapshots.length === 0 && (
          <div className="visualizer-panel__empty">
            <p>No execution steps captured.</p>
            <p className="visualizer-panel__empty-hint">
              Write some JavaScript code with variable assignments to see the visualization.
            </p>
          </div>
        )}

        {!state.isRunning && !state.error && currentSnapshot && (
          <>
            {/* Current Step Info */}
            <div className="visualizer-panel__step-info">
              <div className="visualizer-panel__line-info">
                <ChevronRight size={14} />
                <span>Line {currentSnapshot.lineNumber}</span>
              </div>
              {currentSnapshot.description && (
                <span className="visualizer-panel__description">
                  {currentSnapshot.description}
                </span>
              )}
            </div>

            {/* Variables Display */}
            <div className="visualizer-panel__variables">
              <h3 className="visualizer-panel__section-title">Variables</h3>
              {currentSnapshot.variables.length === 0 ? (
                <p className="visualizer-panel__no-vars">No variables in scope</p>
              ) : (
                <div className="visualizer-panel__vars-grid">
                  {currentSnapshot.variables.map((variable, i) => (
                    <VariableCard key={`${variable.name}-${i}`} variable={variable} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
