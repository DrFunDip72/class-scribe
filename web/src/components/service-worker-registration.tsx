"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on every load so the app stays installable.
 * Notification settings previously owned this registration, which meant the
 * install prompt never appeared for users who had not enabled pop-ups.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration is best effort; the app works without it.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
