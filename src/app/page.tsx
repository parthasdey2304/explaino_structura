"use client";

import dynamic from "next/dynamic";
import { ExcalidrawErrorBoundary } from "@/components/ExcalidrawErrorBoundary";
import AuthGate from "@/components/AuthGate";

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

export default function Home() {
  return (
    <AuthGate>
      <ExcalidrawErrorBoundary>
        <ExcalidrawWrapper />
      </ExcalidrawErrorBoundary>
    </AuthGate>
  );
}
