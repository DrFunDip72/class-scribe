const DEFAULT_URL = "/dashboard";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Class Scribe", {
    body: payload.body || "Your class notes are ready.",
    icon: "/class-scribe-icon.svg",
    badge: "/class-scribe-icon.svg",
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
