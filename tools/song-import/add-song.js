import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { videoId, songName } from "./song-import.js";
import { chromePath } from "../../tests/support.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const ui = createInterface({ input: process.stdin, output: process.stdout });
const read = (name) =>
  JSON.parse(
    fs.readFileSync(`content/${name}.json`, "utf8").replace(/^\uFEFF/, ""),
  );
const write = (name, data) =>
  fs.writeFileSync(
    `content/${name}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
function run(
  script,
  args = [],
  { env = {}, timeout = 180000, stdio = "inherit" } = {},
) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout,
  });
  if (result.error?.code === "ETIMEDOUT")
    throw new Error(
      `Превышено время ожидания: ${script}. Проверьте доступ к сети и повторите запуск.`,
    );
  if (result.status !== 0) throw new Error(`Не выполнено: ${script}`);
  return result;
}
async function ask(label, fallback = "") {
  const answer =
    (
      await ui.question(`${label}${fallback ? ` [${fallback}]` : ""}: `)
    ).trim() || fallback;
  if (!answer) throw new Error(`Не заполнено: ${label}`);
  return answer;
}
let server;
let changed = false;
let retryLink;
try {
  const unknown = process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknown.length)
    throw new Error(`Неизвестный параметр: ${unknown.join(", ")}`);
  const link =
    process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
    (await ask("Вставьте ссылку YouTube"));
  const id = videoId(link);
  retryLink = `https://www.youtube.com/watch?v=${id}`;
  const songs = read("songs");
  const saved = songs.find((s) => s.id === id || s.alt?.includes(id));
  if (saved && !process.argv.includes("--resume"))
    throw new Error("Это видео уже есть в каталоге.");
  let song = saved;
  if (!song) {
    let original = "";
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (r.ok) original = (await r.json()).title;
    } catch {}
    if (!original) {
      try {
        const r = await fetch(`https://www.youtube.com/watch?v=${id}`, {
          signal: AbortSignal.timeout(15000),
        });
        const html = await r.text();
        original = (html.match(/<title>(.*?)<\/title>/)?.[1] || "")
          .replace(/ - YouTube$/, "")
          .replaceAll("&amp;", "&")
          .replaceAll("&#39;", "'")
          .replaceAll("&quot;", '"');
      } catch {}
    }
    const guessed = songName(original);
    if (original) console.log(`Видео: ${original}`);
    const artist = await ask("Исполнитель", guessed.artist);
    const title = await ask("Название песни", guessed.title);
    const existing = songs.find(
      (s) =>
        s.artist.toLowerCase() === artist.toLowerCase() &&
        s.title.toLowerCase() === title.toLowerCase(),
    );
    if (existing) {
      if (
        (await ask(
          "Такая песня уже есть. Добавить альтернативную версию? да/нет",
          "нет",
        )) !== "да"
      )
        throw new Error("Добавление отменено.");
      song = existing;
      song.alt = [...(song.alt || []), id];
    } else {
      const lang = await ask(
        "Язык: ru или en",
        /[а-яё]/i.test(artist + title) ? "ru" : "en",
      );
      if (!["ru", "en"].includes(lang))
        throw new Error("Язык должен быть ru или en");
      const categories = [...new Set(songs.map((s) => s.category))];
      categories.forEach((value, index) =>
        console.log(`${index + 1}. ${value}`),
      );
      const category =
        categories[
          Number(
            await ask(
              "Номер раздела",
              String(
                categories.indexOf(
                  lang === "en" ? "Зарубежная музыка" : "Русская поп-музыка",
                ) + 1,
              ),
            ),
          ) - 1
        ];
      if (!category) throw new Error("Нет такого раздела");
      const genre = await ask("Жанр", "Поп");
      song = { id, artist, title, genre, category, lang };
      songs.push(song);
    }
    if ((await ask(`Добавить ${artist} — ${title}? да/нет`, "да")) !== "да")
      throw new Error("Добавление отменено.");
    write("songs", songs);
    changed = true;
  } else {
    changed = true;
    console.log(`Продолжаю проверку: ${song.artist} — ${song.title}`);
  }
  const existingCues = read("lyrics")[song.id];
  let approvedCues = existingCues;
  if (existingCues?.verse?.length || existingCues?.chorus?.length) {
    if (!existingCues.verse?.length)
      throw new Error(
        "Добавьте полный куплет в content/lyrics.json и повторите запуск с --resume.",
      );
    if (!existingCues.chorus?.length)
      throw new Error(
        "Добавьте полный припев в content/lyrics.json и повторите запуск с --resume.",
      );
    console.log("Караоке:", retryLink);
    console.log("Подсказка:", JSON.stringify(existingCues, null, 2));
    if (
      (await ask(
        "Сверили с караоке исполнителя и все строки первого куплета и припева? Введите да",
        "нет",
      )) !== "да"
    )
      throw new Error(
        "Проверьте подсказки в content/lyrics.json и повторите запуск с --resume.",
      );
  } else {
    ui.close();
    const { output } = run(
      "scripts/fetch-lyrics.js",
      ["--review", "--video", id, "--report-saved", "--only", song.id],
      { timeout: 0, stdio: ["inherit", "inherit", "inherit", "pipe"] },
    );
    if (!output[3])
      throw new Error(
        "Подсказка не сохранена. Заполните content/lyrics.json вручную и повторите запуск с --resume.",
      );
    approvedCues = JSON.parse(output[3]);
  }
  const buildEnv = {
    SONG_IMPORT_APPROVED_CUES: JSON.stringify({
      id: song.id,
      cues: approvedCues,
    }),
  };
  run("scripts/build-catalog.js", [], { env: buildEnv });
  server = spawn(process.execPath, ["scripts/dev-server.js"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Сервер не запустился")),
      10000,
    );
    server.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Сервер остановился"));
    });
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  const chrome = fs.existsSync(chromePath())
    ? chromePath()
    : "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  console.log("Проверяю воспроизведение YouTube…");
  run("scripts/check-embeds.js", ["--only", id], {
    env: { CHECK_BASE_URL: base, CHROME_PATH: chrome },
  });
  const result = read("embeds").find((s) => s.id === id);
  if (result?.status !== "ok" && ![101, 150].includes(result?.error))
    throw new Error(
      "Проверка видео не завершена. Повторите запуск с --resume.",
    );
  if (result.status !== "ok")
    console.log(
      "Автор запретил встраивание: песня будет открываться на YouTube.",
    );
  run("scripts/build-catalog.js", [], { env: buildEnv });
  console.log("Добавлено в локальный каталог. Обновите страницу сайта.");
} catch (error) {
  console.error(error.message);
  if (changed)
    console.error(
      `Локальные данные сохранены. Продолжить: node tools/song-import/add-song.js --resume "${retryLink}"`,
    );
  process.exitCode = 1;
} finally {
  server?.kill();
  ui.close();
}
