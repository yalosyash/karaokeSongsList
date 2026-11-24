/* Предлагает подсказки из LRCLIB. --review сохраняет только подтверждённые варианты. */

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { buildLyrics } from "./lib/lyrics.js";
import { norm } from "../src/core/text.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const content = path.join(here, "..", "content");

const songsFile = path.join(content, "songs.json");
const lyricsFile = path.join(content, "lyrics.json");

const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

const args = process.argv.slice(2);
const force = args.includes("--force");
const review = args.includes("--review");
const reportSaved = args.includes("--report-saved");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex > -1 ? args[onlyIndex + 1]?.split(",") : null;
const videoIndex = args.indexOf("--video");
const reviewVideo = videoIndex > -1 ? args[videoIndex + 1] : undefined;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function saveCues(id, previous, cues) {
  const lock = lyricsFile + ".lock";
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(
          `Файл подсказок заблокирован (${lock}). Если загрузчики завершены, удалите папку блокировки и повторите проверку.`,
        );
      }
      await sleep(50);
    }
  }

  const temporary = path.join(lock, "lyrics.json");
  try {
    const current = readJson(lyricsFile);
    if (JSON.stringify(current[id]) !== JSON.stringify(previous)) return false;

    current[id] = cues;
    fs.writeFileSync(
      temporary,
      JSON.stringify(current, null, 2) + "\n",
      "utf8",
    );
    fs.renameSync(temporary, lyricsFile);
    return true;
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.rmdirSync(lock);
  }
}

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

async function findLyrics(song) {
  const artist = norm(song.artist);
  const title = norm(song.title);
  const queries = [
    { artist_name: song.artist, track_name: song.title },
    { q: song.title },
  ];
  let unmarked;
  for (const query of queries) {
    const items = await search(query);
    for (const item of items) {
      if (
        !item.plainLyrics ||
        item.instrumental ||
        norm(item.artistName ?? "") !== artist ||
        norm(item.trackName ?? "") !== title
      )
        continue;

      const cues = buildLyrics(item.plainLyrics);
      if (cues) return { item, cues };
      unmarked ??= { item, cues: null };
    }
  }
  return unmarked;
}

async function main() {
  const songs = readJson(songsFile);
  if (onlyIndex !== -1 && (!only?.[0] || only[0].startsWith("--"))) {
    throw new Error("После --only укажите ID песен.");
  }
  const selected = only
    ? songs.filter((song) => only.includes(song.id))
    : songs;
  if (reportSaved && (!review || only?.length !== 1 || selected.length !== 1)) {
    throw new Error(
      "Для --report-saved нужны --review и одна песня через --only.",
    );
  }
  if (videoIndex !== -1) {
    if (!reviewVideo || reviewVideo.startsWith("--")) {
      throw new Error("После --video укажите ID видео.");
    }
    if (only?.length !== 1 || selected.length !== 1) {
      throw new Error("Для --video укажите одну песню через --only.");
    }
    const [song] = selected;
    if (reviewVideo !== song.id && !song.alt?.includes(reviewVideo)) {
      throw new Error(`Видео ${reviewVideo} не принадлежит песне ${song.id}.`);
    }
  }
  const lyrics = readJson(lyricsFile);
  const pending = selected.filter((song) => {
    const cues = lyrics[song.id];
    return force || (!cues?.verse?.length && !cues?.chorus?.length);
  });

  if (!pending.length) {
    console.log("Нет песен для поиска подсказок.");
    return;
  }

  const ui = review
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  const answers = ui?.[Symbol.asyncIterator]();
  let saved = 0;
  try {
    for (const song of pending) {
      console.log(`${song.artist} — ${song.title} (${song.id})`);
      const draft = await findLyrics(song);
      if (!draft) {
        console.log(
          "Точное совпадение не найдено. Подсказку нужно заполнить вручную.",
        );
        continue;
      }
      console.log(`LRCLIB: ${draft.item.artistName} — ${draft.item.trackName}`);
      const video = reviewVideo ?? song.id;
      console.log(`Караоке: https://www.youtube.com/watch?v=${video}`);
      if (!draft.cues) {
        console.log(
          "Куплет и припев не размечены полностью. Внесите оба раздела вручную после сверки.",
        );
        continue;
      }
      console.log(JSON.stringify(draft.cues, null, 2));
      if (!answers) continue;

      console.log(
        "Сверьте с караоке исполнителя и все строки первого куплета и припева.",
      );
      process.stdout.write(
        "Первый куплет и припев совпадают целиком? Введите «да» для сохранения: ",
      );
      const answer = await answers.next();
      if (answer.done) break;
      if (answer.value.trim().toLowerCase() !== "да") {
        console.log("Пропущено. Исправленный вариант можно внести вручную.");
        continue;
      }

      if (!(await saveCues(song.id, lyrics[song.id], draft.cues))) {
        console.log(
          "Подсказка изменилась во время проверки. Повторите просмотр.",
        );
        continue;
      }
      saved++;
      // Импортёр читает подтверждение отдельно от интерактивного вывода.
      if (reportSaved) fs.writeFileSync(3, JSON.stringify(draft.cues), "utf8");
    }
  } finally {
    ui?.close();
  }

  console.log(
    review
      ? `Сохранено после проверки: ${saved} из ${pending.length}.`
      : "Предпросмотр завершён. Для сохранения запустите с --review.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
