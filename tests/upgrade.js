import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { SONGS } from "../data/catalog.js";
import { root, preparePage, ready, diagnostics } from "./support.js";

// A deliberately stale release fixture, served at the same origin as the new
// release. Both versions execute the real application's worker and UI modules.
export async function releaseUpgradeSteps(browser, check) {
  let previous = true;
  let networkAvailable = true;
  const previousCache = "karaoke-v7";
  const neighborCache = "karaoke-videos";
  const currentWorker = await fs.readFile(path.join(root, "sw.js"), "utf8");
  const currentCache = currentWorker.match(/const CACHE = "([^"]+)"/)[1];
  const oldSongs = SONGS.map((song) => ({
    ...song,
    title: `${song.title} [previous release]`,
  }));
  let catalog = oldSongs;
  const types = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
  };
  const server = http.createServer(async (req, res) => {
    // Also refuse requests at the server: the offline check must not succeed
    // through a worker fetch that escapes the browser's offline emulation.
    if (!networkAvailable) {
      res.destroy();
      return;
    }
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/sw.js") {
        res.writeHead(200, {
          "content-type": "text/javascript",
          "cache-control": "no-store",
        });
        res.end(
          previous
            ? currentWorker.replace(
                `const CACHE = "${currentCache}"`,
                `const CACHE = "${previousCache}"`,
              )
            : currentWorker,
        );
        return;
      }
      if (pathname === "/data/catalog.js") {
        res.writeHead(200, {
          "content-type": "text/javascript",
          "cache-control": "max-age=600",
        });
        res.end(`export const SONGS = ${JSON.stringify(catalog)};`);
        return;
      }
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      const content = await fs.readFile(file);
      res.writeHead(200, {
        "content-type": types[path.extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(0);
  await once(server, "listening");
  const base = `http://localhost:${server.address().port}/`;
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await preparePage(page, base);
    await ready(page, base);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    networkAvailable = false;
    await page.setOfflineMode(true);
    await ready(page, base);
    const stale = await page.$$eval(".row-title", (nodes) =>
      nodes.every((n) => n.textContent.endsWith("[previous release]")),
    );
    if (!stale)
      throw new Error(
        "Previous release was not cached: upgrade test precondition failed",
      );
    check(
      "обновление: предыдущий каталог действительно доступен из офлайн-кеша",
      stale,
    );
    await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      await cache.put(
        "/neighbor/offline.html",
        new Response("neighbor offline"),
      );
    }, neighborCache);
    previous = false;
    catalog = SONGS;
    networkAvailable = true;
    await page.setOfflineMode(false);
    await page.evaluate(async () => {
      window.previousWorker = navigator.serviceWorker.controller;
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await page.waitForFunction(
      async (current, old) => {
        const keys = await caches.keys();
        return (
          keys.includes(current) &&
          !keys.includes(old) &&
          navigator.serviceWorker.controller &&
          navigator.serviceWorker.controller !== window.previousWorker
        );
      },
      { timeout: 15000 },
      currentCache,
      previousCache,
    );
    check(
      "после обновления соседнее приложение сохраняет свой офлайн-кеш",
      await page.evaluate(async (name) => {
        const response = await caches.match("/neighbor/offline.html", {
          cacheName: name,
        });
        return (await response?.text()) === "neighbor offline";
      }, neighborCache),
    );
    check(
      "новый service worker сохраняет свежий каталог при установке",
      await page.evaluate(async (cacheName) => {
        const response = await caches.match("/data/catalog.js", { cacheName });
        return (
          response?.ok &&
          !(await response.text()).includes("[previous release]")
        );
      }, currentCache),
    );
    await ready(page, base);
    networkAvailable = false;
    await page.setOfflineMode(true);
    await ready(page, base);
    const actual = await page.$$eval(".row", (nodes) =>
      nodes
        .map((n) => [n.dataset.id, n.querySelector(".row-title").textContent])
        .sort(),
    );
    const expected = SONGS.map((song) => [song.id, song.title]).sort();
    check(
      "после обновления новый каталог доступен офлайн без старых названий",
      JSON.stringify(actual) === JSON.stringify(expected),
    );
    await page.click(".row");
    check(
      "после обновления офлайн работает выбор песни и текст",
      await page.$eval("#lyricsBody", (node) => !!node.textContent.trim()),
    );

    // A catalog-only deploy leaves sw.js unchanged.
    const updatedSong = {
      ...SONGS[0],
      title: `${SONGS[0].title} [catalog update]`,
    };
    catalog = [updatedSong, ...SONGS.slice(1)];
    networkAvailable = true;
    await page.setOfflineMode(false);
    await ready(page, base);
    const hasUpdatedSong = () =>
      page.$eval(
        `.row[data-id="${updatedSong.id}"] .row-title`,
        (node, title) => node.textContent === title,
        updatedSong.title,
      );
    check(
      "каталог обновляется при открытии без сброса HTTP-кеша",
      await hasUpdatedSong(),
    );
    networkAvailable = false;
    await page.setOfflineMode(true);
    await ready(page, base);
    check(
      "новые данные каталога сохраняются для работы офлайн",
      await hasUpdatedSong(),
    );
    check(
      "обновление service worker без ошибок JavaScript",
      errors.length === 0,
      errors.join("; "),
    );
  } catch (error) {
    check("обновление установленного приложения", false, error.message);
    await diagnostics(page, "upgrade", error);
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
