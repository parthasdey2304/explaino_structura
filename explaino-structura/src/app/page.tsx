"use client";

import dynamic from "next/dynamic";

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
          background: "#fff",
        }}
      >
        <span style={{ color: "#999", fontSize: 14 }}>Loading canvas…</span>
      </div>
    ),
  }
);

export default function Home() {
  return <ExcalidrawWrapper />;
}