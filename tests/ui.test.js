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

    await themeSteps(page);
    await youtubeTooltipSteps(page);
    await dropdownSteps(page);
    await steps(page);
    await themeScrollSteps(page);
    await playerLayoutSteps(page);
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

async function youtubeTooltipSteps(page) {
  const icon = await page.$(".row-ext");
  await icon.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await icon.hover();
  check(
    "подсказка не появляется сразу при наведении",
    await page.$eval("#app-tooltip", (node) => node.hidden),
  );
  await page.waitForFunction(
    () => !document.getElementById("app-tooltip").hidden,
  );
  check(
    "кастомная подсказка YouTube появляется при наведении",
    await page.$eval(
      "#app-tooltip",
      (node) => !node.hidden && node.getAttribute("role") === "tooltip",
    ),
  );
  check(
    "у значка нет дублирующей браузерной подсказки",
    await icon.evaluate((node) => !node.hasAttribute("title")),
  );
  for (const theme of [
    "original",
    "amethyst",
    "indigo",
    "cherry",
    "emerald",
    "vinyl",
    "lavender",
  ]) {
    check(
      `подсказка использует палитру ${theme}`,
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        const tooltip = document.getElementById("app-tooltip");
        const style = getComputedStyle(tooltip);
        const probe = document.createElement("div");
        probe.style.background =
          theme === "lavender" ? "var(--sidebar-bg)" : "var(--bg-2)";
        document.body.append(probe);
        const matches =
          style.backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove();
        const rect = tooltip.getBoundingClientRect();
        return (
          matches &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight
        );
      }, theme),
    );
  }
  await page.keyboard.press("Escape");
  check(
    "Escape скрывает подсказку",
    await page.$eval("#app-tooltip", (node) => node.hidden),
  );
  await icon.focus();
  check(
    "фокус клавиатуры показывает подсказку",
    await page.$eval("#app-tooltip", (node) => !node.hidden),
  );
  await page.evaluate(() =>
    document.querySelector(".song-list").dispatchEvent(new Event("scroll")),
  );
  check(
    "прокрутка скрывает подсказку",
    await page.$eval("#app-tooltip", (node) => node.hidden),
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".row");
}

async function dropdownSteps(page) {
  const control = await page.$(".row-ext");
  await control.focus();
  check(
    "кнопки переиспользуют общий тултип",
    await page.$eval(
      "#app-tooltip",
      (node) => !node.hidden && node.textContent === "Играет только на YouTube",
    ),
  );
  check(
    "системные подсказки заменены, название iframe сохранено",
    await page.evaluate(
      () =>
        document.querySelectorAll("[title]:not(iframe)").length === 0 &&
        !!document.querySelector("iframe[title]"),
    ),
  );
  await page.focus("#search");
  await page.click(".row");
  // Клик прокручивает список к первой строке. Дожидаемся остановки:
  // запоздалый scroll иначе закроет только что открытое меню сортировки.
  await page.waitForFunction(
    () => {
      const list = document.querySelector(".song-list");
      const position = `${list.scrollLeft}:${list.scrollTop}`;
      const now = performance.now();
      const previous = window.__testListScroll;
      if (!previous || previous.position !== position) {
        window.__testListScroll = { position, since: now };
        return false;
      }
      return now - previous.since >= 100;
    },
    { polling: "raf", timeout: 5000 },
  );
  await page.evaluate(() => delete window.__testListScroll);
  const selected = await page.$eval(".row.active", (node) => node.dataset.id);
  for (const value of ["title", "category", "genre", "artist"]) {
    await page.click("#sortToggle");
    await page.click(`#sortMenu [data-value="${value}"]`);
    check(
      `меню сортировки выбирает ${value}`,
      await page.$eval(
        "#sort",
        (node, expected) => node.value === expected,
        value,
      ),
    );
  }
  await page.focus("#sortToggle");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  check(
    "Space выбирает сортировку и возвращает фокус",
    await page.evaluate(
      () =>
        document.querySelector("#sort").value === "genre" &&
        document.activeElement.id === "sortToggle",
    ),
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  check(
    "клавиатура меню не переключает и не запускает песню",
    await page.$eval(
      ".row.active",
      (node, id) =>
        node.dataset.id === id && !document.querySelector("#ytFrame iframe"),
      selected,
    ),
  );
  await page.click("#sortToggle");
  await page.keyboard.press("Escape");
  check(
    "Escape закрывает сортировку и возвращает фокус",
    await page.evaluate(
      () =>
        document.activeElement.id === "sortToggle" &&
        !document.querySelector("#sortMenu").matches(":popover-open"),
    ),
  );
  await page.click("#sortToggle");
  await page.keyboard.press("Tab");
  check(
    "Tab выходит из сортировки к следующей кнопке",
    await page.evaluate(
      () =>
        document.activeElement.id === "randomBtn" &&
        !document.querySelector("#sortMenu").matches(":popover-open"),
    ),
  );
  await page.click("#sortToggle");
  await page.click(".brand");
  check(
    "клик снаружи закрывает сортировку",
    await page.$eval(
      "#sortToggle",
      (node) => node.getAttribute("aria-expanded") === "false",
    ),
  );
  for (const width of [1500, 1180, 900, 560, 390, 320]) {
    await page.setViewport({ width, height: 940 });
    await page.$eval("#moreFilters", (node) => (node.open = true));
    for (const id of ["sort", "genreFilter", "langFilter"]) {
      await page.click(`#${id}Toggle`);
      check(
        `меню ${id} доступно при ${width}px`,
        await page.$eval(`#${id}Menu`, (node) => {
          const rect = node.getBoundingClientRect();
          const top = node.querySelector("button").getBoundingClientRect();
          return (
            node.matches(":popover-open") &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight &&
            node.contains(document.elementFromPoint(top.x + 8, top.y + 8))
          );
        }),
      );
      await page.keyboard.press("Escape");
      const labelPoint = await page.$eval(`#${id}Label`, (node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x + 4, y: rect.y + rect.height / 2 };
      });
      await page.mouse.click(labelPoint.x, labelPoint.y);
      check(
        `клик по подписи открывает ${id} при ${width}px`,
        await page.$eval(`#${id}Menu`, (node) => node.matches(":popover-open")),
      );
      await page.mouse.click(labelPoint.x, labelPoint.y);
      check(
        `повторный клик по подписи закрывает ${id} при ${width}px`,
        await page.$eval(
          `#${id}Menu`,
          (node) => !node.matches(":popover-open"),
        ),
      );
      await page.click(`#${id}Toggle`);
      await page.click(`#${id}Toggle`);
      check(
        `повторный клик закрывает ${id} при ${width}px`,
        await page.$eval(
          `#${id}Menu`,
          (node) => !node.matches(":popover-open"),
        ),
      );
    }
  }
  await page.click("#genreFilterToggle");
  await page.click('#genreFilterMenu [data-value="Хард-рок"]');
  await page.click("#langFilterToggle");
  await page.click('#langFilterMenu [data-value="en"]');
  check(
    "новые меню применяют жанр и язык",
    await page.evaluate(
      () =>
        document.querySelector("#genreFilter").value === "Хард-рок" &&
        document.querySelector("#langFilter").value === "en",
    ),
  );
  await page.click("#resetFilters");
  check(
    "сброс обновляет подписи и выбранные пункты",
    await page.evaluate(
      () =>
        document.querySelector("#genreFilterToggle").textContent ===
          "Все жанры" &&
        document.querySelector("#langFilterToggle").textContent === "Любой" &&
        document
          .querySelector('#genreFilterMenu [data-value=""]')
          .getAttribute("aria-checked") === "true",
    ),
  );
  await page.$eval("#moreFilters", (node) => (node.open = false));
  await page.setViewport({ width: 1500, height: 940 });
}

async function themeSteps(page) {
  await page.setViewport({ width: 1500, height: 940 });
  const currentTheme = () => page.$eval("html", (node) => node.dataset.theme);
  const chooseTheme = async (theme) => {
    await page.click("#themeToggle");
    await page.click('[data-theme-option="' + theme + '"]');
  };
  check(
    "по умолчанию оригинальная тема",
    (await currentTheme()) === "original",
  );
  await page.click(".row");
  const selected = await page.$eval(".row.active", (node) => node.dataset.id);
  for (const [theme, background] of [
    ["amethyst", "rgb(23, 19, 34)"],
    ["indigo", "rgb(17, 24, 39)"],
    ["cherry", "rgb(28, 18, 27)"],
    ["emerald", "rgb(16, 29, 26)"],
    ["vinyl", "rgb(33, 25, 20)"],
    ["lavender", "rgb(228, 222, 236)"],
    ["original", "rgb(10, 10, 17)"],
  ]) {
    await chooseTheme(theme);
    check(
      `палитра ${theme} применяется`,
      (await currentTheme()) === theme &&
        (await page.$eval(
          "body",
          (node) => getComputedStyle(node).backgroundColor,
        )) === background,
    );
  }
  await chooseTheme("lavender");
  check(
    "светлая тема включает светлые системные элементы",
    await page.$eval(
      "html",
      (node) => getComputedStyle(node).colorScheme === "light",
    ),
  );
  await page.hover("#btnYt");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.getElementById("btnYt")).color ===
      "rgb(44, 35, 56)",
  );
  check(
    "иконки при наведении в светлой теме остаются тёмными",
    await page.$eval(
      "#btnYt",
      (node) => getComputedStyle(node).color === "rgb(44, 35, 56)",
    ),
  );
  await chooseTheme("original");
  await page.focus("#themeToggle");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check(
    "выбор темы с клавиатуры не переключает и не запускает песню",
    (await page.$eval(".row.active", (node) => node.dataset.id)) === selected &&
      (await page.$eval("#ytFrame", (node) => node.hidden)),
  );
  await page.click("#themeToggle");
  await page.keyboard.press("Escape");
  check(
    "Escape закрывает меню и возвращает фокус",
    await page.evaluate(
      () =>
        document.getElementById("themeMenu").hidden &&
        document.activeElement.id === "themeToggle",
    ),
  );
  await page.click("#themeToggle");
  await page.click("#nowTitle");
  check(
    "клик снаружи закрывает меню",
    await page.$eval("#themeMenu", (node) => node.hidden),
  );
  await page.focus("#themeToggle");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  check(
    "Tab выходит из меню без ловушки фокуса",
    await page.evaluate(
      () =>
        document.getElementById("themeMenu").hidden &&
        !document
          .getElementById("themePicker")
          .contains(document.activeElement),
    ),
  );
  await chooseTheme("lavender");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".row");
  check(
    "тема сохраняется после перезагрузки",
    (await currentTheme()) === "lavender" &&
      (await page.$eval('[data-theme-option="lavender"]', (node) =>
        node.getAttribute("aria-checked"),
      )) === "true",
  );
  await page.evaluate(() =>
    localStorage.setItem("karaoke.theme.v1", "unknown"),
  );
  await page.reload({ waitUntil: "load" });
  check(
    "неизвестная тема возвращает оригинальную",
    (await currentTheme()) === "original",
  );

  const blocked = await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".row");
  await chooseTheme("indigo");
  check(
    "темы работают без доступа к хранилищу",
    (await currentTheme()) === "indigo",
  );
  await page.removeScriptToEvaluateOnNewDocument(blocked.identifier);
  await page.evaluate(() => {
    // В этой странице хранилище ещё заблокировано; очистим его после перезагрузки.
    document.activeElement.blur();
  });
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".row");
}

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

  /* ── мусор из источника не должен попадать в текст ── */
  const entitySongs = await page.evaluate(
    () =>
      window.__catalog.filter((s) =>
        [...(s.verse || []), ...(s.chorus || [])].some((line) =>
          /&#?\w+;|[\u2028\u2029]/.test(line),
        ),
      ).length,
  );
  check("в текстах нет HTML-сущностей", entitySongs === 0, entitySongs);

  const kaban = await page.evaluate(() => {
    const song = window.__catalog.find((s) => s.title === "Кабан");
    return song ? song.verse[song.verse.length - 1] : "";
  });
  check(
    "строка «Кабан» без мусора",
    kaban === "Кабан — мне бы солнца и чуток желудей (Хей)",
    kaban,
  );

  await page.evaluate(() => {
    const row = [...T.rows()].find(
      (r) => r.querySelector(".row-title").textContent === "Кабан",
    );
    if (row) T.click(row);
  });
  check(
    "мусор не виден в тексте песни",
    !/&#?\w+;/.test(await page.$eval("#lyricsBody", (n) => n.textContent)) &&
      /чуток желудей/.test(
        await page.$eval("#lyricsBody", (n) => n.textContent),
      ),
  );

  // возвращаемся к песне, на которой проверялись плеер и текст
  await page.evaluate(() => T.click(T.row("AJFHUiFof9M")));

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

  /* ── версии: вторая может быть запрещена для встраивания ── */
  const versioned = await page.evaluate(() => {
    const song = window.__catalog.find(
      (s) => s.alt?.length && s.blocked?.includes(s.alt[0]),
    );
    return song ? { id: song.id, alt: song.alt[0], title: song.title } : null;
  });
  check(
    "есть песня с заблокированной второй версией",
    !!versioned,
    versioned?.title,
  );

  if (versioned) {
    // выбор версии 2 до запуска не должен теряться при нажатии ▶
    await page.evaluate((id) => T.click(T.row(id)), versioned.id);
    await page.evaluate(() => T.click(document.getElementById("btnAlt")));
    check(
      "кнопка версии переключает на версию 2",
      (await page.$eval("#altLabel", (n) => n.textContent)) === "Версия 2/2",
    );
    check(
      "подсказка предупреждает про версию на YouTube",
      /только на YouTube/.test(
        await page.$eval("#emptySub", (n) => n.textContent),
      ),
    );

    await page.evaluate(() => {
      window.opened = [];
    });
    await page.evaluate(() => T.click(document.getElementById("bigPlay")));
    check(
      "выбор версии не откатывается молча",
      (await page.$eval("#altLabel", (n) => n.textContent)) === "Версия 2/2",
    );
    check(
      "запрещённая версия открывается на YouTube",
      (await page.evaluate(() => window.opened)).some((url) =>
        url.includes(versioned.alt),
      ),
      (await page.evaluate(() => window.opened)).join(" "),
    );
    check(
      "вместо версии 1 показано объяснение",
      (await page.evaluate(
        () => document.getElementById("videoBlocked").hidden === false,
      )) && (await frameState(page)).hidden,
    );
    check(
      "объяснение называет версию",
      /Версия 2\/2/.test(await page.$eval("#blockedSub", (n) => n.textContent)),
    );
    check(
      "объяснение говорит про новую вкладку",
      /новой вкладке/.test(
        await page.$eval("#blockedSub", (n) => n.textContent),
      ),
    );

    const tabsBefore = (await page.evaluate(() => window.opened)).length;
    await page.evaluate(() => T.click(document.getElementById("bigPlay")));
    check(
      "повторный ▶ не открывает новую вкладку",
      (await page.evaluate(() => window.opened)).length === tabsBefore,
    );
    check(
      "есть кнопка перехода на другую версию",
      await page.evaluate(
        () => document.getElementById("blockedAltBtn").hidden === false,
      ),
    );

    await page.evaluate(() =>
      T.click(document.getElementById("blockedAltBtn")),
    );
    check(
      "кнопка возвращает на играющую версию",
      (await page.$eval("#altLabel", (n) => n.textContent)) === "Версия 1/2",
    );

    // переключение версии на ходу игры не должно оставлять старую версию
    await page.evaluate(() => T.click(document.getElementById("bigPlay")));
    await page.waitForFunction(
      () => !document.getElementById("ytFrame").hidden,
    );
    await page.evaluate(() => T.click(document.getElementById("btnAlt")));
    check(
      "переключение на запрещённую версию останавливает видео",
      (await frameState(page)).hidden &&
        (await page.evaluate(
          () => document.getElementById("videoBlocked").hidden === false,
        )),
    );

    await page.evaluate(() =>
      T.click(document.getElementById("blockedAltBtn")),
    );
    await page.evaluate(() => T.click(document.getElementById("bigPlay")));
    await page.waitForFunction(() =>
      (document.getElementById("ytFrame").getAttribute("src") || "").includes(
        "tOGTcsley1U",
      ),
    );
    check(
      "после возврата играет первая версия",
      (await frameState(page)).src.includes("tOGTcsley1U"),
    );
  }

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

async function themeScrollSteps(page) {
  for (const width of [900, 560, 390, 320]) {
    await page.setViewport({ width, height: 720 });
    const independent = await page.evaluate(() => {
      const pane = document.querySelector(".detail-pane");
      const list = document.querySelector(".list-pane");
      const before = list.getBoundingClientRect().top;
      pane.scrollTop = pane.scrollHeight;
      const box = pane.getBoundingClientRect();
      const ok =
        pane.scrollTop > 0 &&
        box.top > 0 &&
        box.bottom <= innerHeight + 1 &&
        list.getBoundingClientRect().top === before &&
        document.scrollingElement.scrollHeight <= innerHeight + 1;
      pane.scrollTop = 0;
      return ok;
    });
    check(
      "нижняя панель прокручивается независимо при " + width + "px",
      independent,
    );
  }
}

async function playerLayoutSteps(page) {
  for (const width of [1500, 1181, 1180, 1024, 901, 900, 561, 560, 390, 320]) {
    await page.setViewport({ width, height: 720 });
    for (const state of ["empty", "playing", "blocked"]) {
      const layout = await page.evaluate((state) => {
        const shell = document.getElementById("videoShell");
        shell.classList.toggle("is-blocked", state === "blocked");
        document.getElementById("videoEmpty").hidden = state !== "empty";
        document.getElementById("ytFrame").hidden = state !== "playing";
        document.getElementById("videoBlocked").hidden = state !== "blocked";
        // Longest blocked state: explanation and both action buttons.
        document.getElementById("blockedAltBtn").hidden = false;
        const box = shell.getBoundingClientRect();
        const card = shell.parentElement;
        const cardStyle = getComputedStyle(card);
        const innerWidth =
          card.clientWidth -
          parseFloat(cardStyle.paddingLeft) -
          parseFloat(cardStyle.paddingRight);
        const frame = document
          .getElementById("ytFrame")
          .getBoundingClientRect();
        const blocked = document.getElementById("videoBlocked");
        let actionsReachable = true;
        if (state === "blocked") {
          blocked.scrollTop = 0;
          const first = blocked
            .querySelector(".vb-ico")
            .getBoundingClientRect();
          const area = blocked.getBoundingClientRect();
          blocked.scrollTop = blocked.scrollHeight;
          const last = document
            .getElementById("blockedAltBtn")
            .getBoundingClientRect();
          actionsReachable =
            first.top >= area.top && last.bottom <= area.bottom + 1;
        }
        return (
          Math.abs(box.width - innerWidth) < 1 &&
          Math.abs(box.height - (box.width * 9) / 16) < 1 &&
          (state !== "playing" ||
            (Math.abs(frame.width - box.width) < 1 &&
              Math.abs(frame.height - box.height) < 1)) &&
          document.documentElement.scrollWidth <= window.innerWidth &&
          actionsReachable
        );
      }, state);
      check(
        `плеер ${state}: полная ширина, 16:9, элементы доступны при ${width}px`,
        layout,
      );
    }
  }
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
