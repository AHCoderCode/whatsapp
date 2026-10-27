const CACHE_NAME = "vexel-chat-shell-v17";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js?v=people-search-20261027c",
  "/backend.js?v=people-search-20261027c",
  "/calls.js?v=people-search-20261027c",
  "/styles.css?v=people-search-20261027c",
  "/manifest.webmanifest?v=people-search-20261027c",
  "/icon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-512.png",
  "/apple-touch-icon.png"
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
      .then(keys => Promise.all(keys.filter(key => (key.startsWith("whatsapp-frontend-") || key.startsWith("vexel-chat-shell-")) && key !== CACHE_NAME).map(key => caches.delete(key))))
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

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});