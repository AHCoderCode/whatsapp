const CACHE_NAME = "whatsapp-final-shell-v51";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js?v=whatsapp-final-20261029b",
  "/backend.js?v=whatsapp-final-20261029b",
  "/calls.js?v=whatsapp-final-20261029b",
  "/styles.css?v=whatsapp-final-20261029b",
  "/manifest.webmanifest?v=whatsapp-final-20261029b",
  "/whatsapp-favicon.svg?v=whatsapp-final-20261029b",
  "/icon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon.svg?v=whatsapp-final-20261029b",
  "/icon-192.svg?v=whatsapp-final-20261029b",
  "/icon-512.svg?v=whatsapp-final-20261029b",
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
/* Correlate test-call delivery without exposing account data. This uses the
   existing public publishable key, never a service-role credential. */
const PUSH_RECEIPT_URL = "https://qoyqfmovzvtyvxutakym.supabase.co/functions/v1/whatsapp-push";
const PUSH_RECEIPT_API_KEY = "sb_publishable_w59xgI2zOLJe2Hmx_PC4MQ_zDQ8g9hp";
function reportCallTestReceipt(probeId, stage, errorText = "") {
  return fetch(PUSH_RECEIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": PUSH_RECEIPT_API_KEY },
    body: JSON.stringify({ action: "push-receipt", probeId, stage, error: String(errorText || "").slice(0, 240) }),
    cache: "no-store"
  }).then(response => response.ok).catch(() => false);
}

/* Web Push notification display. */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : "" }; }
  const kind = payload.kind || (payload.data && payload.data.kind) || "message";
  const data = Object.assign({ kind, url: "/" }, payload.data || {});
  const title = payload.title || (kind === "call" ? "Incoming call" : "New message");
  const isCallTest = kind === "call" && data.test === true;
  const options = {
    body: payload.body || (kind === "call" ? "Someone is calling you." : "You received a new message."),
    icon: payload.icon || "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: payload.tag || ("wa-push-" + (data.callId || data.chatId || Date.now())),
    renotify: true,
    requireInteraction: kind === "call",
    silent: false,
    vibrate: kind === "call" ? [1200, 350, 1200, 350, 1600] : [180, 80, 180],
    data,
    actions: kind === "call" && !isCallTest
      ? [{ action: "accept", title: "Accept" }, { action: "decline", title: "Decline" }]
      : kind === "call" ? [] : [{ action: "open", title: "Open chat" }]
  };
  const probeId = kind === "call" && data.test === true && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(data.probeId || ""))
    ? String(data.probeId) : "";
  event.waitUntil((async () => {
    // Report receipt alongside display; never make the alert wait for a network
    // request. The server records if this worker received the push and whether
    // showNotification() resolved or threw.
    const receivedReceipt = probeId ? reportCallTestReceipt(probeId, "received") : Promise.resolve(false);
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // A stale "focused" state must never suppress an incoming-call system alert.
      if (kind !== "call" && clients.some(client => client.visibilityState === "visible" && client.focused)) {
        await receivedReceipt;
        return;
      }
      await self.registration.showNotification(title, options);
      if (probeId) await Promise.allSettled([receivedReceipt, reportCallTestReceipt(probeId, "shown")]);
      else await receivedReceipt;
    } catch (error) {
      if (probeId) await Promise.allSettled([receivedReceipt, reportCallTestReceipt(probeId, "error", error && error.message || error)]);
    }
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
