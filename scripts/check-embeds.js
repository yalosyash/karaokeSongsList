/* Проверяет, какие видео каталога запрещено встраивать (ошибки YouTube 101/150),
   и записывает результат в content/embeds.json.

   Нужен Chrome и запущенный dev-server: npm start
   Запуск: npm run check-embeds -- [--limit N] [--only id1,id2]

   После проверки: npm run build — пометки попадут в data/catalog.js */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { SONGS } from "../data/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const reportFile = path.join(root, "content", "embeds.json");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BATCH = 4;

const argOf = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
};

let ids = [...new Set(SONGS.flatMap((song) => [song.id, ...(song.alt || [])]))];

const only = argOf("--only");
if (only) {
  ids = only
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

const limit = argOf("--limit");
if (limit) ids = ids.slice(0, Number(limit));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
    protocolTimeout: 120000,
  });

  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:4173/scripts/embed-check.html", {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.API_READY === true, {
      timeout: 30000,
    });

    const results = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const checked = await page.evaluate(
        (list) => window.checkBatch(list),
        batch,
      );
      results.push(...Object.values(checked));
      process.stdout.write(
        `\r${Math.min(i + BATCH, ids.length)}/${ids.length}`,
      );
    }
    console.log();

    await saveReport(results);
    printSummary(results);
  } finally {
    await browser.close();
  }
}

async function saveReport(results) {
  // старые записи сохраняем: проверка могла идти по части каталога
  const previous = fs.existsSync(reportFile)
    ? JSON.parse(fs.readFileSync(reportFile, "utf8"))
    : [];

  const merged = new Map(previous.map((entry) => [entry.id, entry]));
  for (const result of results) merged.set(result.id, result);

  fs.writeFileSync(
    reportFile,
    JSON.stringify([...merged.values()], null, 1) + "\n",
    "utf8",
  );
}

function printSummary(results) {
  const byStatus = {};
  for (const result of results) {
    const key =
      result.status === "error" ? `err${result.error}` : result.status;
    byStatus[key] = (byStatus[key] || 0) + 1;
  }
  console.log("итог:", byStatus);

  const songByVideo = new Map();
  for (const song of SONGS) {
    songByVideo.set(song.id, song);
    for (const id of song.alt || []) songByVideo.set(id, song);
  }

  for (const result of results.filter((item) => item.status !== "ok")) {
    const song = songByVideo.get(result.id);
    const label = song ? `${song.artist} — ${song.title}` : "?";
    console.log(
      `  ${String(result.status).padEnd(8)} ${String(result.error ?? "").padEnd(4)} ${result.id.padEnd(12)} ${label}`,
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
