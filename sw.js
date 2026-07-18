/* breathz service worker — precache the app shell so sessions work offline. */
const CACHE = "breathz-v2";
const SHELL = [
  "/",
  "/index.html",
  "/css/app.css",
  "/js/app.js",
  "/js/styles.js",
  "/manifest.webmanifest",
  "/icons/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept the API or admin UI.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_/")) return;
  if (e.request.method !== "GET") return;

  // Network-first for navigation (fresh HTML when online), cache fallback offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Stale-while-revalidate for static assets: serve from cache instantly,
  // refresh the cache in the background so a redeploy propagates on next load.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
