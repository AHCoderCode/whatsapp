const CACHE_NAME = "whatsapp-final-shell-v22";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js?v=whatsapp-final-20261027h",
  "/backend.js?v=whatsapp-final-20261027h",
  "/calls.js?v=whatsapp-final-20261027h",
  "/styles.css?v=whatsapp-final-20261027h",
  "/manifest.webmanifest?v=whatsapp-final-20261027h",
  "/whatsapp-favicon.svg?v=whatsapp-final-20261027h",
  "/icon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
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
      .then(keys => Promise.all(keys.filter(key => (key.startsWith("whatsapp-frontend-") || key.startsWith("vexel-chat-shell-") || key.startsWith("whatsapp-web-shell-")) && key !== CACHE_NAME).map(key => caches.delete(key))))
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