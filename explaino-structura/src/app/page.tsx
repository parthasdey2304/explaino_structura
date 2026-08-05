"use client";

import dynamic from "next/dynamic";

const ExcalidrawApp = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="loading-screen">
      <span className="loading-screen__text">Loading canvas…</span>
    </div>
  ),
});

export default function Home() {
  return <ExcalidrawApp />;
}