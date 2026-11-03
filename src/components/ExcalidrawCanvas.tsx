"use client";

// Keep the drawing library's stylesheet with its lazy-loaded renderer so the
// sign-in screen does not download or parse unused canvas styles.
import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import { useEffect, useRef, type ComponentProps } from "react";

export default function ExcalidrawCanvas(props: ComponentProps<typeof Excalidraw>) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    // The installed renderer omits a menu name and marks its canvas controls
    // as a document footer. Supply the missing semantics at this boundary.
    const labelControls = () => {
      const menu = root.querySelector(".main-menu-trigger");
      if (menu && !menu.hasAttribute("aria-label")) menu.setAttribute("aria-label", "Canvas menu");
      const footer = root.querySelector("footer.layer-ui__wrapper__footer");
      if (footer) {
        footer.setAttribute("role", "group");
        footer.setAttribute("aria-label", "Canvas navigation");
      }
    };
    labelControls();
    const observer = new MutationObserver(labelControls);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <div ref={container} style={{ width: "100%", height: "100%" }}><Excalidraw {...props} /></div>;
}
