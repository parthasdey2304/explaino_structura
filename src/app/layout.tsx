import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Assistant, Orbitron } from "next/font/google";
import "./globals.css";
import canvasFonts from "@/lib/canvasFontAssets.json";

const assistant = Assistant({ subsets: ["latin"], variable: "--font-assistant", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap", preload: false });

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Explaino — Whiteboard & Screen",
  description: "An Excalidraw-style interactive whiteboard and screen workspace with your own database.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Explaino",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${assistant.variable} ${orbitron.variable}`} style={{ height: "100%" }} suppressHydrationWarning>
      <head>
        <link rel="preload" href={`${canvasFonts.basePath}${canvasFonts.defaultFont}`} as="font" type="font/woff2" crossOrigin="anonymous" />
        <script
          id="canvas-font-assets"
          dangerouslySetInnerHTML={{
            __html: `window.EXCALIDRAW_ASSET_PATH = ${JSON.stringify(canvasFonts.basePath)};`,
          }}
        />
        <script
          id="suppress-unload-violation"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var oA=EventTarget.prototype.addEventListener,oR=EventTarget.prototype.removeEventListener;EventTarget.prototype.addEventListener=function(t,l,o){return t==='unload'?oA.call(this,'pagehide',l,o):oA.call(this,t,l,o);};EventTarget.prototype.removeEventListener=function(t,l,o){return t==='unload'?oR.call(this,'pagehide',l,o):oR.call(this,t,l,o);};Object.defineProperty(window,'onunload',{configurable:true,enumerable:true,get:function(){return null;},set:function(f){if(typeof f==='function')window.addEventListener('pagehide',f);}});}catch(e){}})();`,
          }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body style={{ height: "100%", overflow: "hidden" }} suppressHydrationWarning>
        <main id="main-content" style={{ height: "100%" }}>{children}</main>
        <Script
          id="pwa-service-worker"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: process.env.NODE_ENV === "production" ? `
              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    console.log('[PWA] Service Worker registered with scope:', reg.scope);
                  }).catch(function(err) {
                    console.warn('[PWA] Service Worker registration failed:', err);
                  });
                });
              }
            ` : `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(registration) {
                    var worker = registration.active || registration.waiting || registration.installing;
                    if (worker && worker.scriptURL === location.origin + '/sw.js') registration.unregister();
                  });
                });
                if ('caches' in window) caches.keys().then(function(keys) {
                  keys.filter(function(key) { return key.startsWith('explaino-pwa-'); }).forEach(function(key) { caches.delete(key); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
