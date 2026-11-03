"use client";

import "@/lib/suppressUnloadViolation";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ExcalidrawErrorBoundary } from "@/components/ExcalidrawErrorBoundary";
import AuthGate from "@/components/AuthGate";
import ReadOnlyCanvasView from "@/components/ReadOnlyCanvasView";

const ExcalidrawWrapper = dynamic(
  () => import("@/components/ExcalidrawWrapper"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0c0e",
        }}
      >
        <span style={{ color: "#a1a1aa", fontSize: 14 }}>Loading canvas…</span>
      </div>
    ),
  }
);

function HomeContent() {
  const searchParams = useSearchParams();
  const viewId = searchParams.get("view");
  const isReadOnly = searchParams.get("readonly") === "true";

  // Dedicated Student Zero-Barrier Read-Only View (outside AuthGate)
  if (viewId && isReadOnly) {
    return <ReadOnlyCanvasView canvasId={viewId} />;
  }

  // Teacher Protected Workspace (inside AuthGate)
  return (
    <AuthGate>
      <ExcalidrawErrorBoundary>
        <ExcalidrawWrapper initialCanvasId={viewId || undefined} />
      </ExcalidrawErrorBoundary>
    </AuthGate>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            width: "100%",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0c0c0e",
          }}
        >
          <span style={{ color: "#a1a1aa", fontSize: 14 }}>Loading workspace…</span>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
