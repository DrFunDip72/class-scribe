const DEFAULT_URL = "/recordings";
const SHELL_CACHE = "class-scribe-shell-v1";
const OFFLINE_URL = "/offline";

// Only the offline fallback and static brand assets are cached. Dashboard,
// result, and API responses are never stored, so private educational data
// never reaches disk through this service worker.
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/class-scribe-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations stay network-first and fall back to a generic offline page.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }
    })());
    return;
  }

  // Brand assets are the only cached responses.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return fetch(request);
    })());
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Class Scribe", {
    body: payload.body || "Your class notes are ready.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "class-scribe-completed",
    renotify: false,
    data: { url: payload.url || DEFAULT_URL },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === targetUrl && "focus" in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
