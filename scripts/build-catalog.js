/* Собирает data/catalog.js из исходников в content/:
   songs.json  — песни (исполнитель, название, жанр, категория, язык, версии видео)
   lyrics.json — тексты по id песни
   meta.json   — названия каналов YouTube по id видео
   embeds.json — отчёт о встраивании видео (заполняет scripts/check-embeds.js)

   Запуск: npm run build
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { norm, searchNorm } from "../src/core/text.js";
import { normalizeLyrics } from "./lib/lyrics.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const content = path.join(root, "content");
const target = path.join(root, "data", "catalog.js");

const readJson = (name) =>
  JSON.parse(
    fs.readFileSync(path.join(content, name), "utf8").replace(/^\uFEFF/, ""),
  );

const songs = readJson("songs.json");
const lyrics = readJson("lyrics.json");
const meta = readJson("meta.json");

/* Отчёт о встраивании может отсутствовать — тогда считаем, что играет всё. */
let blockedIds = new Set();
try {
  const embeds = readJson("embeds.json");
  blockedIds = new Set(
    embeds.filter((item) => item.status !== "ok").map((item) => item.id),
  );
} catch {
  console.warn(
    "content/embeds.json не найден — все видео считаются встраиваемыми",
  );
}

const channelById = new Map(
  meta.filter((item) => item.author).map((item) => [item.id, item.author]),
);

const catalog = songs.map((song) => {
  const versions = [song.id, ...(song.alt || [])];
  const text = normalizeLyrics(lyrics[song.id] || {});

  return {
    id: song.id,
    artist: song.artist,
    title: song.title,
    genre: song.genre,
    category: song.category,
    lang: song.lang,
    channel: channelById.get(song.id) || null,
    alt: song.alt || [],
    // версии, которые автор запретил встраивать
    blocked: versions.filter((id) => blockedIds.has(id)),
    // ни одна версия не встраивается -> только ссылка на YouTube
    noembed: versions.every((id) => blockedIds.has(id)) ? true : undefined,
    verse: text.verse,
    chorus: text.chorus,
    search: norm(`${song.artist} ${song.title} ${song.genre} ${song.category}`),
    searchAlt: searchNorm(
      `${song.artist} ${song.title} ${song.genre} ${song.category}`,
    ),
  };
});

const header = `/* Сгенерировано scripts/build-catalog.js — не править вручную.
   Источник: content/{songs,lyrics,meta,embeds}.json
   Тексты песен: LRCLIB (открытая база). */
`;
const body = `export const SONGS = [\n${catalog
  .map((song) => "  " + JSON.stringify(song))
  .join(",\n")}\n];\n`;

/* Каталог лежит в Git, поэтому форматируем его так же, как остальной код:
   иначе пересборка даёт диф на весь файл. */
const source = await prettier.format(header + body, { parser: "babel" });

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, source, "utf8");

const kb = Math.round(Buffer.byteLength(header + body) / 1024);
const missingChannel = catalog.filter((song) => !song.channel).length;
const missingVerse = catalog.filter((song) => !song.verse).length;
const blocked = catalog.filter((song) => song.noembed).length;

console.log(`data/catalog.js: ${catalog.length} песен, ${kb} КБ`);
console.log(
  `без канала: ${missingChannel} | без куплета: ${missingVerse} | только YouTube: ${blocked}`,
);
