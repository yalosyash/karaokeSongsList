/* Сквозной тест интерфейса: поднимает настоящую страницу в headless Chrome
   и кликает по ней, как пользователь.

   Запуск: npm test
   Нужен Google Chrome; другой путь задаётся через CHROME_PATH. */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4287;
const BASE = `http://localhost:${PORT}/`;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const results = [];
const check = (name, ok, extra = "") =>
  results.push({ name, ok: !!ok, extra: String(extra) });

function startServer() {
  const server = spawn(process.execPath, ["scripts/dev-server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("сервер не стартовал")),
      10000,
    );
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes(String(PORT))) {
        clearTimeout(timer);
        resolve(server);
      }
    });
    server.on("error", reject);
  });
}

async function run() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--mute-audio"],
  });

  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", (error) => jsErrors.push(error.message));

  try {
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector(".row");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".row");

    await steps(page);
  } finally {
    await browser.close();
    server.kill();
  }

  report(jsErrors);
}

/* ── помощники внутри страницы ─────────────────────────────── */

const helpers = `
  window.T = {
    rows: () => [...document.querySelectorAll('.row')],
    row: (id) => document.querySelector('.row[data-id="' + id + '"]'),
    click: (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    dblclick: (node) => node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    key: (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
    typeSearch: (value) => {
      const input = document.getElementById('search');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    change: (id, value) => {
      const control = document.getElementById(id);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
`;

async function steps(page) {
  await page.evaluate(helpers);
  await page.evaluate(async () => {
    window.__catalog = (await import("/data/catalog.js")).SONGS;
  });

  /* ── каталог ── */
  const total = await page.evaluate(() => window.__catalog.length);
  check("каталог загружен", total > 150, total);
  check(
    "все песни в списке",
    (await page.evaluate(() => T.rows().length)) === total,
    await page.evaluate(() => T.rows().length),
  );

  const rowLayout = await page.evaluate(() => {
    const row = T.rows()[0];
    const artist = row.querySelector(".row-artist");
    const title = row.querySelector(".row-title");
    return (
      !!artist &&
      !!title &&
      !!(
        artist.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    );
  });
  check("исполнитель сверху, название снизу", rowLayout);

  const artistSorted = await page.evaluate(() => {
    const artists = T.rows().map(
      (r) => r.querySelector(".row-artist").textContent,
    );
    const sorted = [...artists].sort((a, b) =>
      a.localeCompare(b, "ru", { sensitivity: "base" }),
    );
    return JSON.stringify(artists) === JSON.stringify(sorted);
  });
  check("сортировка по исполнителю", artistSorted);

  /* ── выбор без запуска видео ── */
  await page.evaluate(() => T.click(T.row("AJFHUiFof9M")));
  await page.waitForFunction(
    () => document.getElementById("nowTitle").textContent === "Знаешь ли ты",
  );

  check(
    "песня выбрана",
    (await page.$eval("#nowTitle", (n) => n.textContent)) === "Знаешь ли ты",
  );
  check(
    "исполнитель показан",
    (await page.$eval("#nowArtist", (n) => n.textContent)) === "МакSим",
  );
  check(
    "строка подсвечена",
    (await page.$eval(".row.active", (n) => n.dataset.id)) === "AJFHUiFof9M",
  );

  const idleFrame = await frameState(page);
  check("клик по песне не запускает видео", idleFrame.hidden && !idleFrame.src);
  check(
    "кнопка осталась «Петь»",
    (await page.$eval("#btnPlayLabel", (n) => n.textContent)) === "Петь",
  );
  check(
    "подсказка предлагает запуск",
    /Нажмите ▶/.test(await page.$eval("#emptySub", (n) => n.textContent)),
  );
  check(
    "выбор песни запоминается",
    (await page.evaluate(() => localStorage.getItem("karaoke.last.v1"))) ===
      "AJFHUiFof9M",
  );

  /* ── запуск по явному действию ── */
  await page.evaluate(() => T.key("Enter"));
  await page.waitForFunction(() => !document.getElementById("ytFrame").hidden);

  const playingFrame = await frameState(page);
  check(
    "плеер открылся на странице",
    !playingFrame.hidden && playingFrame.src.includes("AJFHUiFof9M"),
  );
  check("автозапуск включён", playingFrame.src.includes("autoplay=1"));
  check(
    "кнопка стала «Пауза»",
    (await page.$eval("#btnPlayLabel", (n) => n.textContent)) === "Пауза",
  );

  /* ── текст ── */
  const lyricsText = await page.$eval("#lyricsBody", (n) => n.textContent);
  check("куплет показан", /Куплет/.test(lyricsText));
  check("припев показан", /Припев/.test(lyricsText));
  check(
    "верный текст куплета",
    /Я так привыкла жить одним тобой/.test(lyricsText),
  );
  check("верный текст припева", /Вдоль ночных дорог/.test(lyricsText));

  /* ── поиск ── */
  const searchCount = async (query) => {
    await page.evaluate((q) => T.typeSearch(q), query);
    return page.evaluate(() => T.rows().length);
  };

  check(
    "поиск находит МакSим (латиница/кириллица)",
    (await searchCount("максим")) === 9,
  );
  check("поиск по исполнителю", (await searchCount("земфира")) === 5);
  check("поиск по названию", (await searchCount("батарейка")) === 1);
  check("поиск по жанру", (await searchCount("рок")) > 20);

  await page.evaluate(() => T.click(document.getElementById("searchClear")));
  check(
    "очистка поиска",
    (await page.evaluate(() => T.rows().length)) === total,
  );

  /* ── фильтры ── */
  await page.evaluate(() =>
    T.click(
      [...document.querySelectorAll(".chip")].find(
        (c) => c.dataset.cat === "Русский рок",
      ),
    ),
  );
  const rockCount = await page.evaluate(
    () => window.__catalog.filter((s) => s.category === "Русский рок").length,
  );
  check(
    "фильтр по категории",
    (await page.evaluate(() => T.rows().length)) === rockCount,
  );
  check(
    "чип выбран",
    (await page.$eval('.chip[data-cat="Русский рок"]', (n) =>
      n.getAttribute("aria-selected"),
    )) === "true",
  );

  await page.evaluate(() =>
    T.click(document.querySelector('.chip[data-cat="Русский рок"]')),
  );
  check(
    "повторный клик снимает фильтр",
    (await page.evaluate(() => T.rows().length)) === total,
  );

  await page.evaluate(() => T.change("genreFilter", "Хард-рок"));
  const hardRock = await page.evaluate(
    () => window.__catalog.filter((s) => s.genre === "Хард-рок").length,
  );
  check(
    "фильтр по жанру",
    (await page.evaluate(() => T.rows().length)) === hardRock,
  );

  await page.evaluate(() => T.change("langFilter", "en"));
  check("фильтр по языку", (await page.evaluate(() => T.rows().length)) === 0);

  await page.evaluate(() => T.click(document.getElementById("resetFilters")));
  check(
    "сброс фильтров",
    (await page.evaluate(() => T.rows().length)) === total,
  );

  /* ── сортировки ── */
  for (const [mode, label] of [
    ["title", "названию"],
    ["genre", "жанру"],
    ["category", "категории"],
  ]) {
    await page.evaluate((value) => T.change("sort", value), mode);
    const groups = await page.evaluate(
      () => document.querySelectorAll(".group-head").length,
    );
    check(`сортировка по ${label}`, groups > 3, groups);
  }
  await page.evaluate(() => T.change("sort", "artist"));

  /* ── избранное ── */
  await page.evaluate(() => T.click(document.getElementById("btnFav")));
  check(
    "добавлено в избранное",
    await page.evaluate(() =>
      document.getElementById("btnFav").classList.contains("on"),
    ),
  );
  check(
    "избранное сохраняется",
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("karaoke.favs.v1") || "[]").includes(
        "AJFHUiFof9M",
      ),
    ),
  );

  await page.evaluate(() => T.click(document.querySelector(".chip-fav")));
  check(
    "показ только избранного",
    (await page.evaluate(() => T.rows().length)) === 1,
  );
  await page.evaluate(() => T.click(document.querySelector(".chip-fav")));
  check(
    "выход из избранного",
    (await page.evaluate(() => T.rows().length)) === total,
  );

  /* ── большой текст ── */
  await page.evaluate(() => T.click(document.getElementById("btnFullLyrics")));
  check(
    "текст на весь экран",
    await page.evaluate(
      () => document.getElementById("lyricsOverlay").hidden === false,
    ),
  );
  check(
    "в оверлее есть слова",
    /Знаешь ли ты/.test(
      await page.$eval("#overlayInner", (n) => n.textContent),
    ),
  );
  await page.evaluate(() => T.click(document.getElementById("overlayClose")));
  check(
    "оверлей закрылся",
    await page.evaluate(
      () => document.getElementById("lyricsOverlay").hidden === true,
    ),
  );

  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--lyrics-scale")
      .trim(),
  );
  await page.evaluate(() => T.click(document.getElementById("fontPlus")));
  const after = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--lyrics-scale")
      .trim(),
  );
  check("размер текста меняется", before !== after, `${before} → ${after}`);

  /* ── клавиатура ── */
  const beforeArrow = await page.$eval(".row.active", (n) => n.dataset.id);
  await page.evaluate(() => T.key("ArrowDown"));
  check(
    "стрелка вниз переключает песню",
    (await page.$eval(".row.active", (n) => n.dataset.id)) !== beforeArrow,
  );
  const afterArrow = await frameState(page);
  check("стрелка не запускает видео", afterArrow.hidden && !afterArrow.src);

  await page.evaluate(() => T.key("/"));
  check(
    "слэш фокусирует поиск",
    await page.evaluate(
      () => document.activeElement === document.getElementById("search"),
    ),
  );

  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => T.key("Escape"));
  check(
    "Esc останавливает",
    await page.evaluate(
      () => document.getElementById("ytFrame").hidden === true,
    ),
  );
  check(
    "кнопка снова «Петь»",
    (await page.$eval("#btnPlayLabel", (n) => n.textContent)) === "Петь",
  );

  /* ── каждая песня открывается ── */
  const broken = await page.evaluate(() => {
    let failures = 0;
    for (const song of window.__catalog) {
      const row = T.row(song.id);
      if (!row) {
        failures++;
        continue;
      }
      T.click(row);
      if (!document.getElementById("lyricsBody").textContent.trim()) failures++;
      if (document.getElementById("nowTitle").textContent !== song.title)
        failures++;
    }
    return failures;
  });
  check("все песни открываются и показывают текст", broken === 0, broken);

  /* ── видео без встраивания ── */
  const noembed = await page.evaluate(() =>
    window.__catalog
      .filter((s) => s.noembed)
      .map((s) => ({ id: s.id, title: s.title })),
  );
  check("есть песни без встраивания", noembed.length > 0, noembed.length);

  await page.evaluate(() => {
    window.opened = [];
    window.open = (url) => {
      window.opened.push(url);
      return null;
    };
  });

  await page.evaluate((id) => T.click(T.row(id)), noembed[0].id);
  check(
    "выбор такой песни не грузит видео",
    (await frameState(page)).hidden === true,
  );

  await page.evaluate(() => T.click(document.getElementById("bigPlay")));
  await page.waitForFunction(
    () => document.getElementById("videoBlocked").hidden === false,
  );

  check(
    "вместо чёрного плеера — понятное сообщение",
    await page.evaluate(
      () => document.getElementById("videoBlocked").hidden === false,
    ),
  );
  const blockedFrame = await frameState(page);
  check(
    "iframe не грузит запрещённое видео",
    blockedFrame.hidden && !blockedFrame.src,
  );
  check(
    "объяснено, почему не играет",
    /только на YouTube/.test(
      await page.$eval("#videoBlocked", (n) => n.textContent),
    ),
  );
  check(
    "вкладку не открываем сами",
    (await page.evaluate(() => window.opened.length)) === 0,
  );

  await page.evaluate(() => T.click(document.getElementById("openYtBtn")));
  const opened = await page.evaluate(() => window.opened);
  check(
    "кнопка «Смотреть на YouTube» ведёт на видео",
    opened.length === 1 && opened[0].includes(noembed[0].id),
    opened.join(" "),
  );
  check(
    "в списке помечены такие песни",
    await page.evaluate(
      (id) => !!T.row(id)?.querySelector(".row-ext"),
      noembed[0].id,
    ),
  );

  // обычная песня по-прежнему играет в рамке
  const normalId = await page.evaluate(
    () => window.__catalog.find((s) => !s.noembed).id,
  );
  await page.evaluate((id) => T.click(T.row(id)), normalId);
  await page.evaluate(() => T.click(document.getElementById("bigPlay")));
  await page.waitForFunction(() => !document.getElementById("ytFrame").hidden);

  const normalFrame = await frameState(page);
  check(
    "обычная песня играет в плеере",
    (await page.evaluate(
      () => document.getElementById("videoBlocked").hidden,
    )) &&
      !normalFrame.hidden &&
      normalFrame.src.includes(normalId),
  );

  /* ── двойной клик всё ещё запускает ── */
  const dblId = await page.evaluate(
    (skip) => window.__catalog.find((s) => !s.noembed && s.id !== skip).id,
    normalId,
  );
  await page.evaluate((id) => T.click(T.row(id)), dblId);
  const afterFirstClick = await frameState(page);
  check(
    "первый клик только выбирает",
    afterFirstClick.hidden || !afterFirstClick.src.includes(dblId),
  );

  await page.evaluate((id) => T.dblclick(T.row(id)), dblId);
  await page.waitForFunction(() => !document.getElementById("ytFrame").hidden);
  const dblFrame = await frameState(page);
  check(
    "двойной клик запускает видео",
    dblFrame.src.includes(dblId) &&
      (await page.$eval("#btnPlayLabel", (n) => n.textContent)) === "Пауза",
  );
}

const frameState = (page) =>
  page.evaluate(() => {
    const frame = document.getElementById("ytFrame");
    return { hidden: frame.hidden, src: frame.getAttribute("src") || "" };
  });

function report(jsErrors) {
  console.log("");
  let failed = 0;
  for (const result of results) {
    if (!result.ok) failed++;
    const extra = result.extra ? `  [${result.extra}]` : "";
    console.log(`${result.ok ? "  ok  " : " FAIL "} ${result.name}${extra}`);
  }

  if (jsErrors.length) console.log("\nОшибки JS:\n" + jsErrors.join("\n"));
  console.log(
    `\n${results.length - failed}/${results.length} проверок пройдено, ${jsErrors.length} ошибок JS\n`,
  );
  process.exit(failed || jsErrors.length ? 1 : 0);
}

run().catch((error) => {
  console.error("ТЕСТ УПАЛ:", error.message);
  process.exit(1);
});
