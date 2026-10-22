import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@excalidraw/excalidraw"],
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/code-server",
        destination: "/code-server/",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/code-server/",
        destination: "http://13.49.76.201/",
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
        source: "/stable-:hash/:path*",
        destination: "http://13.49.76.201/stable-:hash/:path*",
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
