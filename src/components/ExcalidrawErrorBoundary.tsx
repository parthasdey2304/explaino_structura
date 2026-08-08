"use client";

import React, { Component, type ReactNode } from "react";
import { RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ExcalidrawErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    try {
      localStorage.removeItem("explaino-autosave");
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null });
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
            background: "var(--default-bg-color, #fff)",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              maxWidth: "400px",
            }}
          >
            <div
              style={{
                fontSize: "2rem",
                marginBottom: "1rem",
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
                color: "var(--color-on-surface, #333)",
              }}
            >
              Canvas Error
            </h2>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--color-gray-60, #888)",
                marginBottom: "1.5rem",
                lineHeight: 1.5,
              }}
            >
              The whiteboard encountered an error. This can happen when saved scene data is corrupted or incompatible.
            </p>
            <button
              onClick={this.handleReset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "0.85rem",
                fontWeight: 500,
                border: "1px solid var(--color-primary, #6965db)",
                borderRadius: "6px",
                background: "var(--color-primary, #6965db)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <RefreshCcw size={14} />
              Clear & Reset
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
