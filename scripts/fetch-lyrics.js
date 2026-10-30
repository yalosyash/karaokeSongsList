/* Заполняет content/lyrics.json текстами из открытой базы LRCLIB.
   Работает только по песням, у которых ещё нет куплета, — уже найденные
   тексты не трогает (их правки живут прямо в content/lyrics.json).

   Запуск: npm run fetch-lyrics -- [--force] [--only id1,id2]
   После загрузки: npm run build */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildLyrics, normalizeLyrics } from "./lib/lyrics.js";
import { norm } from "../src/core/text.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const content = path.join(here, "..", "content");

const songsFile = path.join(content, "songs.json");
const lyricsFile = path.join(content, "lyrics.json");

const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex > -1 ? args[onlyIndex + 1].split(",") : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function search(query, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(
        "https://lrclib.net/api/search?" + new URLSearchParams(query),
        {
          headers: {
            "user-agent": "songList/1.0 (karaoke catalog; https://lrclib.net)",
          },
          signal: AbortSignal.timeout(25000),
        },
      );
      if (response.status === 404) return [];
      if (!response.ok) throw new Error("HTTP " + response.status);
      const body = await response.json();
      return Array.isArray(body) ? body : [];
    } catch {
      if (attempt === tries - 1) return [];
      await sleep(1000 * (attempt + 1));
    }
  }
  return [];
}

const stripFeat = (value) =>
  String(value)
    .replace(/\s*(&|ft\.|feat\.|x)\s.*$/i, "")
    .trim();

/** Насколько результат LRCLIB похож на нужную песню. */
function score(item, artist, title) {
  const wantArtist = norm(stripFeat(artist));
  const wantTitle = norm(title);
  const gotArtist = norm(item.artistName);
  const gotTitle = norm(item.trackName);

  let total = 0;
  if (gotTitle === wantTitle) total += 60;
  else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle))
    total += 35;

  if (gotArtist === wantArtist) total += 40;
  else if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist))
    total += 22;

  if (!item.plainLyrics) total -= 300;
  if (item.instrumental) total -= 300;
  return total;
}

const bestMatch = (items, song) =>
  items.reduce(
    (best, item) => {
      const value = score(item, song.artist, song.title);
      return value > best.value ? { value, item } : best;
    },
    { value: -Infinity, item: null },
  ).item;

const searchVariants = (song) => [
  { artist_name: stripFeat(song.artist), track_name: song.title },
  { q: `${stripFeat(song.artist)} ${song.title}` },
  { q: song.title },
];

async function findLyrics(song) {
  let best = null;
  let bestScore = -1;

  for (const query of searchVariants(song)) {
    const items = await search(query);
    for (const item of items) {
      const value = score(item, song.artist, song.title);
      if (value > bestScore) {
        bestScore = value;
        best = item;
      }
    }
    if (bestScore >= 90) break;
    await sleep(300);
  }

  if (!best || bestScore < 60 || !best.plainLyrics) return null;
  return normalizeLyrics(buildLyrics(best.plainLyrics) || {});
}

async function main() {
  const songs = readJson(songsFile);
  const lyrics = readJson(lyricsFile);

  const pending = songs.filter((song) => {
    if (only) return only.includes(song.id);
    if (force) return true;
    return !lyrics[song.id]?.verse;
  });

  if (!pending.length) {
    console.log("Все песни уже с текстами — нечего загружать.");
    return;
  }

  console.log(`Ищу тексты для ${pending.length} песен…`);

  let found = 0;
  for (const [index, song] of pending.entries()) {
    const text = await findLyrics(song);
    if (text?.verse) {
      lyrics[song.id] = text;
      found++;
      console.log(`ok   ${song.artist} — ${song.title}`);
    } else {
      console.log(`--   ${song.artist} — ${song.title} (не найдено)`);
    }

    // сохраняем на ходу: длинная загрузка не должна терять результат
    if ((index + 1) % 5 === 0) {
      fs.writeFileSync(
        lyricsFile,
        JSON.stringify(lyrics, null, 2) + "\n",
        "utf8",
      );
    }
  }

  fs.writeFileSync(lyricsFile, JSON.stringify(lyrics, null, 2) + "\n", "utf8");
  console.log(`\nНайдено ${found} из ${pending.length}. Дальше: npm run build`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
