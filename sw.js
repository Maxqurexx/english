// Offline support. The app's own files come from the network when it is reachable
// (so updates show up right away) and from the cache when offline. Fonts and icons
// from CDNs never change, so they are served from the cache first.
const VERSION = "v2";
const CORE = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/srs.js",
  "js/placement.js",
  "data/words.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request);
      if (cached && !sameOrigin) return cached;
      try {
        const res = await fetch(e.request, sameOrigin ? { cache: "no-cache" } : undefined);
        if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })
  );
});
