// Suppress Chrome's "[Violation] Permissions policy violation: unload is not allowed in this document"
// by gracefully mapping deprecated 'unload' event registrations to the modern, standard 'pagehide' event.

if (typeof window !== "undefined") {
  try {
    const origAdd = EventTarget.prototype.addEventListener;
    const origRemove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      if (type === "unload") {
        return origAdd.call(this, "pagehide", listener, options);
      }
      return origAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) {
      if (type === "unload") {
        return origRemove.call(this, "pagehide", listener, options);
      }
      return origRemove.call(this, type, listener, options);
    };

    if (window.addEventListener !== EventTarget.prototype.addEventListener) {
      const origWinAdd = window.addEventListener;
      const origWinRemove = window.removeEventListener;
      window.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === "unload") {
          return origWinAdd.call(window, "pagehide", listener, options);
        }
        return origWinAdd.call(window, type, listener, options);
      };
      window.removeEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
      ) {
        if (type === "unload") {
          return origWinRemove.call(window, "pagehide", listener, options);
        }
        return origWinRemove.call(window, type, listener, options);
      };
    }

    try {
      Object.defineProperty(window, "onunload", {
        configurable: true,
        enumerable: true,
        get() {
          return null;
        },
        set(fn) {
          if (typeof fn === "function") {
            window.addEventListener("pagehide", fn);
          }
        },
      });
    } catch (_) {}
  } catch (_) {}
}

export {};
