"use client";

/**
 * Chrome fires `beforeinstallprompt` once, early, and often before React has
 * mounted. The listener is therefore registered at module scope so the event is
 * captured rather than missed, and components read it through a store.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = "installed" | "ready" | "unavailable";
export type Platform = "ios" | "android" | "other";

let deferredEvent: BeforeInstallPromptEvent | null = null;
let wasInstalled = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function runningStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's own mini-infobar so the in-app button owns the flow.
    event.preventDefault();
    deferredEvent = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredEvent = null;
    wasInstalled = true;
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", emit);
}

export function subscribeToInstallState(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getInstallState(): InstallState {
  if (wasInstalled || runningStandalone()) return "installed";
  return deferredEvent ? "ready" : "unavailable";
}

/** The server cannot know; "unavailable" renders the manual instructions. */
export function getServerInstallState(): InstallState {
  return "unavailable";
}

export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent;
  // iPadOS reports a desktop agent, so touch support disambiguates it.
  if (/iPad|iPhone|iPod/.test(agent)) return "ios";
  if (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/.test(agent)) return "android";
  return "other";
}

export function getServerPlatform(): Platform {
  return "other";
}

/**
 * A `beforeinstallprompt` event can only be used once. If the user dismisses
 * the browser dialog the state falls back to the manual instructions until
 * Chrome chooses to fire the event again.
 */
export async function promptInstall() {
  const event = deferredEvent;
  if (!event) return "unavailable" as const;
  deferredEvent = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}
