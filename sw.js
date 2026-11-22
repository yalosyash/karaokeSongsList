/* Офлайн-кеш: список песен и тексты должны открываться мгновенно, даже без сети.
   Само видео всё равно приходит с YouTube.

   Стратегия — network-first с запасным кешем. При наличии сети браузер
   проверяет актуальность файлов в своём HTTP-кеше. */

const CACHE = "karaoke-v11";

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
  "./src/features/lyric-scale.js",
  "./src/core/theme.js",
  "./src/core/text.js",
  "./src/core/offline.js",
  "./src/catalog/catalog.js",
  "./src/catalog/filter.js",
  "./src/features/actions.js",
  "./src/features/controls.js",
  "./src/features/dropdowns.js",
  "./src/features/filters.js",
  "./src/features/list.js",
  "./src/features/tooltip.js",
  "./src/features/lyrics.js",
  "./src/features/player/player.js",
  "./src/features/player/youtube.js",
  "./src/css/tokens.css",
  "./src/css/base.css",
  "./src/css/sidebar.css",
  "./src/css/player.css",
  "./src/css/lyrics.css",
  "./src/css/responsive.css",
];

function revalidateOnNextRequest(response) {
  if (!response.ok || response.redirected) return response;
  // Иначе вкладка может взять свежую по max-age копию из памяти, минуя воркер.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          ASSETS.map((asset) => new Request(asset, { cache: "no-cache" })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => /^karaoke-v\d+$/.test(key) && key !== CACHE)
            .map((key) => caches.delete(key)),
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
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {}),
          );
        }
        return revalidateOnNextRequest(response);
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) =>
            hit ? revalidateOnNextRequest(hit) : Response.error(),
          ),
      ),
  );
});
