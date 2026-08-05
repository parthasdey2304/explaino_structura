import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explaino — Whiteboard",
  description: "An Excalidraw-style collaborative whiteboard — saved locally in your browser.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ height: "100%", overflow: "hidden" }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}