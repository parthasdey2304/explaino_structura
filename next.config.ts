import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@excalidraw/excalidraw"],
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "unload=*",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/code-server",
        destination: "https://13.49.76.201.sslip.io/?folder=/home/ubuntu/workspace",
      },
      {
        source: "/code-server/:path*",
        destination: "https://13.49.76.201.sslip.io/:path*",
      },
      {
        source: "/_static/:path*",
        destination: "https://13.49.76.201.sslip.io/_static/:path*",
      },
      {
        source: "/stable-:hash/:path*",
        destination: "https://13.49.76.201.sslip.io/stable-:hash/:path*",
      },
      {
        source: "/login",
        destination: "https://13.49.76.201.sslip.io/login",
      },
      {
        source: "/manifest.json",
        destination: "https://13.49.76.201.sslip.io/manifest.json",
      },
    ];
  },
};

export default nextConfig;
