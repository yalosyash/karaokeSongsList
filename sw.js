/* Офлайн-кеш: список песен и тексты должны открываться мгновенно, даже без сети.
   Само видео всё равно приходит с YouTube.

   Стратегия — network-first с запасным кешем. Cache-first отдавал бы старые
   HTML/JS/CSS после обновления: изменения «не появлялись» до ручной очистки кеша. */

const CACHE = "karaoke-v4";

const ASSETS = [
  "./",
  "./index.html",
  "./assets/manifest.webmanifest",
  "./assets/icon.svg",
  "./data/catalog.js",
  "./src/main.js",
  "./src/core/dom.js",
  "./src/core/state.js",
  "./src/core/storage.js",
  "./src/core/settings.js",
  "./src/core/text.js",
  "./src/core/offline.js",
  "./src/catalog/catalog.js",
  "./src/catalog/filter.js",
  "./src/features/actions.js",
  "./src/features/controls.js",
  "./src/features/favorites.js",
  "./src/features/filters.js",
  "./src/features/keyboard.js",
  "./src/features/list.js",
  "./src/features/lyrics.js",
  "./src/features/player.js",
  "./src/features/player/youtube.js",
  "./src/css/tokens.css",
  "./src/css/base.css",
  "./src/css/sidebar.css",
  "./src/css/player.css",
  "./src/css/lyrics.css",
  "./src/css/responsive.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // трафик YouTube и шрифтов не кешируем
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || Response.error()),
      ),
  );
});
