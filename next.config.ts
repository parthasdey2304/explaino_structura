import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@excalidraw/excalidraw"],
  async rewrites() {
    return [
      {
        source: "/code-server",
        destination: "http://13.49.76.201/login",
      },
      {
        source: "/code-server/:path*",
        destination: "http://13.49.76.201/:path*",
      },
      {
        source: "/_static/:path*",
        destination: "http://13.49.76.201/_static/:path*",
      },
      {
        source: "/login",
        destination: "http://13.49.76.201/login",
      },
      {
        source: "/manifest.json",
        destination: "http://13.49.76.201/manifest.json",
      },
    ];
  },
};

export default nextConfig;
