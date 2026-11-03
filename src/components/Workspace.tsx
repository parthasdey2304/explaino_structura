"use client";

import dynamic from "next/dynamic";
import AuthGate from "./AuthGate";
import { ExcalidrawErrorBoundary } from "./ExcalidrawErrorBoundary";

const Canvas = dynamic(() => import("./ExcalidrawWrapper"), {
  ssr: false,
  loading: () => (
    <div role="status" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0c0e", color: "#a1a1aa" }}>
      Loading canvas…
    </div>
  ),
});

export default function Workspace({ initialCanvasId, initialCheckingAuth }: { initialCanvasId?: string; initialCheckingAuth: boolean }) {
  return (
    <AuthGate initialCheckingAuth={initialCheckingAuth}>
      <ExcalidrawErrorBoundary>
        <Canvas initialCanvasId={initialCanvasId} />
      </ExcalidrawErrorBoundary>
    </AuthGate>
  );
}
