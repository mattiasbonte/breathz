/* breathz service worker — precache the app shell so sessions work offline.
   Base-relative so the app can live at any path (domain root or subfolder). */
// Bump on every release: the byte change triggers the update flow
// (install → activate → old caches purged → in-app "updated" toast).
const CACHE = "breathz-v25";
const BASE = new URL(".", self.location).pathname; // "/" or "/subpath/"
const SHELL = [
  "",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/model.js",
  "js/qr.js",
  "js/i18n.js",
  "js/i18n-practices.js",
  "js/styles.js",
  "manifest.webmanifest",
  "icons/favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
].map((p) => BASE + p);

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
  if (e.request.method !== "GET") return;

  // Network-first for navigation (fresh HTML when online), cache fallback offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(BASE + "index.html", copy));
          return res;
        })
        .catch(() => caches.match(BASE + "index.html"))
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
