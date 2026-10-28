const CACHE_NAME = "whatsapp-final-shell-v36";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js?v=whatsapp-final-20261028g",
  "/backend.js?v=whatsapp-final-20261028g",
  "/calls.js?v=whatsapp-final-20261028g",
  "/styles.css?v=whatsapp-final-20261028g",
  "/manifest.webmanifest?v=whatsapp-final-20261028g",
  "/whatsapp-favicon.svg?v=whatsapp-final-20261028g",
  "/icon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon.svg?v=whatsapp-final-20261028g",
  "/icon-192.svg?v=whatsapp-final-20261028g",
  "/icon-512.svg?v=whatsapp-final-20261028g",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => (key.startsWith("whatsapp-final-shell-") || key.startsWith("whatsapp-frontend-") || key.startsWith("vexel-chat-shell-") || key.startsWith("whatsapp-web-shell-")) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Network-first for same-origin assets: installed clients must not pin old
  // JavaScript forever. Keep an offline fallback in the versioned shell cache.
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match(url.pathname)))
  );
});
/* Web Push notification display. */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : "" }; }
  const kind = payload.kind || (payload.data && payload.data.kind) || "message";
  const data = Object.assign({ kind, url: "/" }, payload.data || {});
  const title = payload.title || (kind === "call" ? "Incoming call" : "New message");
  const options = {
    body: payload.body || (kind === "call" ? "Someone is calling you." : "You received a new message."),
    icon: payload.icon || "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: payload.tag || ("wa-push-" + (data.callId || data.chatId || Date.now())),
    renotify: true,
    requireInteraction: kind === "call",
    data,
    actions: kind === "call"
      ? [{ action: "accept", title: "Accept" }, { action: "decline", title: "Decline" }]
      : [{ action: "open", title: "Open chat" }]
  };
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.some(client => client.visibilityState === "visible" && client.focused)) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "open";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => "focus" in item);
    if (client) {
      await client.focus();
      client.postMessage({
        type: "whatsapp-notification-action",
        kind: data.kind,
        chatId: data.chatId,
        callId: data.callId,
        action
      });
      return;
    }
    const target = new URL(data.url || "/", self.location.origin);
    if (data.kind === "call" && data.callId) {
      target.searchParams.set("waPushKind", "call");
      target.searchParams.set("waCallId", String(data.callId));
      target.searchParams.set("waPushAction", action);
    } else if (data.chatId) {
      target.searchParams.set("waChatId", String(data.chatId));
    }
    await self.clients.openWindow(target.toString());
  }));
});
