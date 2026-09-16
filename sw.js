const CACHE_NAME = "trip-planner-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first for CDN libraries (jsPDF, Sortable, fonts) so they stay current when online,
  // falling back to cache when offline. Cache-first for the local app shell.
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;

  if (isLocal) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
