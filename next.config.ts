import type { NextConfig } from "next";

const REMOTE_VPS_PROXY_TARGET = "https://13.49.76.201.sslip.io/proxy";
const REMOTE_VPS_TOKEN = "explaino_sec_8b41915d25547e2edd553bab03ea4cbd";

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
      {
        source: "/preview/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
      {
        source: "/proxy/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/preview/:port",
        destination: "/preview/:port/",
        permanent: false,
      },
      {
        source: "/proxy/:port",
        destination: "/proxy/:port/",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      // Code Server Rewrites (Preserved)
      {
        source: "/code-server",
        destination: `https://13.49.76.201.sslip.io/?token=${REMOTE_VPS_TOKEN}&folder=/home/ubuntu/workspace`,
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

      // Web Preview Rewrites (Milestone 1)
      {
        source: "/preview/:port",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/?token=${REMOTE_VPS_TOKEN}`,
      },
      {
        source: "/preview/:port/",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/?token=${REMOTE_VPS_TOKEN}`,
      },
      {
        source: "/preview/:port/:path*",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/:path*?token=${REMOTE_VPS_TOKEN}`,
      },

      // VPS Proxy Base Href Rewrites (Milestone 1)
      {
        source: "/proxy/:port",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/?token=${REMOTE_VPS_TOKEN}`,
      },
      {
        source: "/proxy/:port/",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/?token=${REMOTE_VPS_TOKEN}`,
      },
      {
        source: "/proxy/:port/:path*",
        destination: `${REMOTE_VPS_PROXY_TARGET}/:port/:path*?token=${REMOTE_VPS_TOKEN}`,
      },
    ];
  },
};

export default nextConfig;
