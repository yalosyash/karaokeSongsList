/* Offline-first: the song list and lyrics must open instantly, even without internet.
   The karaoke video itself still streams from YouTube.

   Strategy: network-first with a cache fallback. Cache-first would keep serving
   old HTML/JS/CSS after an update, which is exactly what caused changes to the
   page to "not appear" until the cache was cleared by hand. */
const CACHE = "karaoke-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // never cache YouTube traffic
  if (
    url.hostname.includes("youtube") ||
    url.hostname.includes("ytimg") ||
    url.hostname.includes("google")
  )
    return;

  if (url.origin !== location.origin) return;

  // network-first: always try to get the current file, fall back to the
  // cached copy only when offline (that is when speed matters most)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
