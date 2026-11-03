import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Assistant, Orbitron } from "next/font/google";
import "./globals.css";

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
        <Script
          id="suppress-unload-violation"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var origAdd = EventTarget.prototype.addEventListener;
                  var origRemove = EventTarget.prototype.removeEventListener;
                  EventTarget.prototype.addEventListener = function(type, listener, options) {
                    if (type === 'unload') {
                      return origAdd.call(this, 'pagehide', listener, options);
                    }
                    return origAdd.call(this, type, listener, options);
                  };
                  EventTarget.prototype.removeEventListener = function(type, listener, options) {
                    if (type === 'unload') {
                      return origRemove.call(this, 'pagehide', listener, options);
                    }
                    return origRemove.call(this, type, listener, options);
                  };
                  Object.defineProperty(window, 'onunload', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return null; },
                    set: function(fn) {
                      if (typeof fn === 'function') {
                        window.addEventListener('pagehide', fn);
                      }
                    }
                  });
                } catch (e) {}
              })();
            `,
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
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    console.log('[PWA] Service Worker registered with scope:', reg.scope);
                  }).catch(function(err) {
                    console.warn('[PWA] Service Worker registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
