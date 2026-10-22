"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ExcalidrawErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ExcalidrawErrorBoundary] Whiteboard canvas error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem("explaino-autosave");
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--default-bg-color, #18181b)",
            color: "#f4f4f5",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "2.5rem",
              maxWidth: "480px",
              background: "#27272a",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontSize: "2.5rem",
                marginBottom: "0.75rem",
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
                color: "#ffffff",
              }}
            >
              Canvas Error
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#a1a1aa",
                marginBottom: "1.25rem",
                lineHeight: 1.5,
              }}
            >
              The whiteboard encountered an unexpected error. You can try reloading the page without losing your work, or reset the scene if corrupt data is present.
            </p>

            {this.state.error?.message && (
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "0.75rem",
                  color: "#fca5a5",
                  fontFamily: "monospace",
                  textAlign: "left",
                  marginBottom: "1.5rem",
                  maxHeight: "100px",
                  overflowY: "auto",
                  wordBreak: "break-all",
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  border: "1px solid #6366f1",
                  borderRadius: "8px",
                  background: "#6366f1",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={14} />
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#e4e4e7",
                  cursor: "pointer",
                }}
              >
                <RefreshCcw size={14} />
                Clear & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
