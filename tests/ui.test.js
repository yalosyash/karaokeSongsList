/* Сквозной тест интерфейса: поднимает настоящую страницу в headless Chrome
   и кликает по ней, как пользователь.

   Запуск: npm test
   Браузер: npm run test:browser. Другой путь задаётся через CHROME_PATH. */

import { spawn } from "node:child_process";

import puppeteer from "puppeteer-core";
import { scenarioSteps } from "./scenarios.js";

import {
  root,
  chromePath,
  preparePage,
  ready,
  diagnostics,
  assertTransport,
} from "./support.js";
import { once } from "node:events";
import { releaseUpgradeSteps } from "./upgrade.js";
import { edgeSongs, playerContractSteps } from "./player-contracts.js";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: !!ok, extra: String(extra) });
  console.log(
    (ok ? "ok " : "FAIL ") + name + (extra ? " [" + extra + "]" : ""),
  );
};

async function startServer() {
  const server = spawn(process.execPath, ["scripts/dev-server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("сервер не стартовал: " + output)),
        10000,
      );
      const finish = (error, value) => {
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      server.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) finish(null, match[0] + "/");
      });
      server.stderr.on("data", (chunk) => {
        output += chunk;
      });
      server.once("error", (error) => finish(error));
      server.once("exit", (code) =>
        finish(new Error("сервер завершился (" + code + "): " + output)),
      );
    });
    return { server, base };
  } catch (error) {
    server.kill();
    throw error;
  }
}

async function run() {
  let server, browser, page;
  const jsErrors = [];
  try {
    const started = await startServer();
    server = started.server;
    const base = started.base;
    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ["--no-sandbox", "--mute-audio"],
    });
    console.log("Browser: " + (await browser.version()));
    for (const suite of [
      themeSteps,
      rowWidthSteps,
      tooltipTimingSteps,
      youtubeTooltipSteps,
      dropdownSteps,
      steps,
      themeScrollSteps,
      playerLayoutSteps,
    ]) {
      if (process.env.TEST_SUITE && process.env.TEST_SUITE !== suite.name)
        continue;
      const context = await browser.createBrowserContext();
      page = await context.newPage();
      page.on("pageerror", (error) =>
        jsErrors.push(suite.name + ": " + error.message),
      );
      await page.setViewport({ width: 1500, height: 940 });
      // Icon/menu contracts must survive changes to real embed availability.
      const catalog = [
        tooltipTimingSteps,
        youtubeTooltipSteps,
        dropdownSteps,
      ].includes(suite)
        ? edgeSongs
        : undefined;
      await preparePage(page, base, { catalog });
      try {
        await ready(page, base);
        if (suite === themeScrollSteps || suite === playerLayoutSteps) {
          await page.click(".row");
          await page.click("#btnPlay");
        }
        const before = results.filter((r) => !r.ok).length;
        const errorsBefore = jsErrors.length;
        await suite(page);
        assertTransport(page);
        if (
          results.filter((r) => !r.ok).length > before ||
          jsErrors.length > errorsBefore
        )
          await diagnostics(
            page,
            suite.name,
            JSON.stringify(
              { failures: results.filter((r) => !r.ok), jsErrors },
              null,
              2,
            ),
          );
      } catch (error) {
        check(suite.name, false, error.message);
        await diagnostics(page, suite.name, error);
      } finally {
        await context.close();
        page = null;
      }
    }
    for (const [name, execute] of [
      ["scenarios", () => scenarioSteps(browser, base, check)],
      ["player", () => playerContractSteps(browser, base, check)],
      ["upgrade", () => releaseUpgradeSteps(browser, check)],
    ]) {
      if (process.env.TEST_SUITE && process.env.TEST_SUITE !== name) continue;
      try {
        await execute();
      } catch (error) {
        check(name, false, error.message);
      }
    }
  } catch (error) {
    check("запуск тестов", false, error.message);
    await diagnostics(page, "runner", error);
  } finally {
    try {
      await browser?.close();
    } finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const closed = once(server, "exit");
        server.kill();
        await closed;
      }
    }
  }
  report(jsErrors);
}

/* ── помощники внутри страницы ─────────────────────────────── */

function installHelpers() {
  window.T = {
    rows: () => [...document.querySelectorAll(".row")],
    row: (id) => document.querySelector('.row[data-id="' + id + '"]'),
    click: (node) =>
      node.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    dblclick: (node) =>
      node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    key: (key) =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      ),
    typeSearch: (value) => {
      const input = document.getElementById("search");
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    change: (id, value) => {
      const control = document.getElementById(id);
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    },
  };
}

async function rowWidthSteps(page) {
  for (const width of [1280, 1024, 390, 320]) {
    await page.setViewport({ width, height: 720 });
    for (const selector of [".row:not(:has(.row-ext))", ".row:has(.row-ext)"]) {
      const row = await page.$(selector);
      if (!row) continue; // Edge-case icons are also exercised with the fixed contract catalog.
      await page.mouse.move(0, 0);
      const before = await row.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return {
          height: box.height,
          title: node.querySelector(".row-title").getBoundingClientRect().width,
          artist: node.querySelector(".row-artist").getBoundingClientRect()
            .width,
          titleTop:
            node.querySelector(".row-title").getBoundingClientRect().top -
            box.top,
          artistTop:
            node.querySelector(".row-artist").getBoundingClientRect().top -
            box.top,
          width: box.width,
        };
      });
      await row.hover();
      const valid = await row.evaluate((node, before) => {
        const title = node.querySelector(".row-title").getBoundingClientRect();
        const artist = node
          .querySelector(".row-artist")
          .getBoundingClientRect();
        const meta = node.querySelector(".row-meta").getBoundingClientRect();
        const icon = node.querySelector(".row-ext")?.getBoundingClientRect();
        return (
          before.title >= before.width - 60 &&
          Math.abs(before.artist - before.title) < 1 &&
          Math.abs(node.getBoundingClientRect().height - before.height) < 1 &&
          Math.abs(
            title.top - node.getBoundingClientRect().top - before.titleTop,
          ) < 1 &&
          Math.abs(
            artist.top - node.getBoundingClientRect().top - before.artistTop,
          ) < 1 &&
          title.right <= meta.left &&
          meta.top >= node.getBoundingClientRect().top &&
          meta.bottom <= node.getBoundingClientRect().bottom &&
          [...node.querySelectorAll(".row-badge")].every(
            (badge) =>
              badge.scrollWidth <= badge.clientWidth + 1 &&
              getComputedStyle(badge).textOverflow !== "ellipsis",
          ) &&
          meta.width > 0 &&
          artist.right <= meta.left &&
          (!icon || (title.right <= icon.left && meta.right <= icon.left))
        );
      }, before);
      check(
        `ширина текста и метки без пересечений: ${selector}, ${width}px`,
        valid,
      );
    }
    const failures = await page.evaluate(() => {
      const failures = [];
      for (const row of document.querySelectorAll(".row")) {
        document.activeElement?.blur();
        const height = row.getBoundingClientRect().height;
        row.focus({ preventScroll: true });
        const box = row.getBoundingClientRect();
        const title = row.querySelector(".row-title").getBoundingClientRect();
        const meta = row.querySelector(".row-meta").getBoundingClientRect();
        if (
          Math.abs(box.height - height) > 1 ||
          title.width < 40 ||
          title.right > meta.left ||
          meta.bottom > box.bottom ||
          meta.top < box.top
        )
          failures.push(row.dataset.id);
      }
      document.activeElement?.blur();
      return failures;
    });
    check(
      `все карточки сохраняют высоту и место для текста при ${width}px`,
      failures.length === 0,
      failures.join(", "),
    );
  }
  const wrapping = await page.evaluate(() => {
    const row = document.querySelector(".row");
    row.focus({ preventScroll: true });
    const meta = row.querySelector(".row-meta");
    const original = meta.innerHTML;
    const height = row.getBoundingClientRect().height;
    const layout = (labels) => {
      meta.replaceChildren(
        ...labels.map((label) => {
          const badge = document.createElement("span");
          badge.className = "row-badge";
          badge.textContent = label;
          return badge;
        }),
      );
      return [...meta.children].map((badge) => badge.getBoundingClientRect());
    };
    const short = layout(["Поп", "Рок", "EN"]);
    const singleLine = short.every((box) => box.top === short[0].top);
    const long = layout(["Зарубежное", "Электроника", "EN"]);
    const wrapped = long[1].top > long[0].top && long[2].top === long[1].top;
    const stable = row.getBoundingClientRect().height === height;
    meta.innerHTML = original;
    row.blur();
    return singleLine && wrapped && stable;
  });
  check("теги идут подряд и переносятся только при нехватке ширины", wrapping);
  await page.setViewport({ width: 800, height: 600 });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".row");
}

async function tooltipTimingSteps(page) {
  const result = await page.evaluate(() => {
    const originalSet = window.setTimeout,
      originalClear = window.clearTimeout;
    const scheduled = new Map();
    let next = -1;
    window.setTimeout = (callback, delay) => {
      const id = next--;
      scheduled.set(id, { callback, delay });
      return id;
    };
    window.clearTimeout = (id) =>
      scheduled.has(id) ? scheduled.delete(id) : originalClear(id);
    const anchor = document.querySelector(".row-ext");
    const tooltip = document.getElementById("app-tooltip");
    const enter = () =>
      anchor.dispatchEvent(
        new PointerEvent("pointerover", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    const leave = () =>
      anchor.dispatchEvent(
        new PointerEvent("pointerout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    try {
      enter();
      const delayed =
        tooltip.hidden &&
        scheduled.size === 1 &&
        [...scheduled.values()][0].delay > 0;
      for (const [id, task] of [...scheduled]) {
        scheduled.delete(id);
        task.callback();
      }
      const shown = !tooltip.hidden;
      leave();
      enter();
      leave();
      return {
        delayed,
        shown,
        cancelled: tooltip.hidden && scheduled.size === 0,
      };
    } finally {
      window.setTimeout = originalSet;
      window.clearTimeout = originalClear;
    }
  });
  check("подсказка скрыта до срабатывания таймера", result.delayed);
  check("таймер действительно показывает подсказку", result.shown);
  check("уход указателя отменяет ожидающую подсказку", result.cancelled);
}

async function youtubeTooltipSteps(page) {
  const icon = await page.$(".row-ext");
  await icon.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await icon.hover();

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
  await page.evaluate(installHelpers);
  await page.evaluate(async () => {
    window.__catalog = (await import("/data/catalog.js")).SONGS;
  });

  const primary = await page.evaluate(() =>
    window.__catalog.find(
      (s) =>
        !s.noembed &&
        !s.blocked?.includes(s.id) &&
        s.verse?.length &&
        s.chorus?.length,
    ),
  );
  if (!primary)
    throw new Error(
      "Каталог не содержит песни с куплетом, припевом и разрешённым видео",
    );

  /* ── каталог ── */
  const total = await page.evaluate(() => window.__catalog.length);
  check("каталог загружен", total > 0, total);
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
  await page.evaluate((id) => T.click(T.row(id)), primary.id);
  await page.waitForFunction(
    (title) => document.getElementById("nowTitle").textContent === title,
    {},
    primary.title,
  );

  check(
    "песня выбрана",
    (await page.$eval("#nowTitle", (n) => n.textContent)) === primary.title,
  );
  check(
    "исполнитель показан",
    (await page.$eval("#nowArtist", (n) => n.textContent)) === primary.artist,
  );
  check(
    "строка подсвечена",
    (await page.$eval(".row.active", (n) => n.dataset.id)) === primary.id,
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
      primary.id,
  );

  /* ── запуск по явному действию ── */
  await page.evaluate(() => T.key("Enter"));
  await page.waitForFunction(() => !document.getElementById("ytFrame").hidden);

  const playingFrame = await frameState(page);
  check(
    "плеер открылся на странице",
    !playingFrame.hidden && playingFrame.src.includes(primary.id),
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
    primary.verse.every((line) => lyricsText.includes(line)),
  );
  check(
    "верный текст припева",
    primary.chorus.every((line) => lyricsText.includes(line)),
  );

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

  /* ── поиск ── */
  for (const query of ["максим", "земфира", "батарейка"]) {
    await page.evaluate((q) => T.typeSearch(q), query);
    const match = await page.evaluate((query) => {
      const expected = window.__catalog
        // These three single-word queries need only case folding and the
        // known Latin S in МакSим. Do not reuse the application's search index.
        .filter((song) =>
          [song.artist, song.title, song.genre, song.category]
            .join(" ")
            .toLowerCase()
            .replaceAll("s", "с")
            .replaceAll("ё", "е")
            .includes(query),
        )
        .map((s) => s.id)
        .sort();
      const actual = T.rows()
        .map((r) => r.dataset.id)
        .sort();
      return JSON.stringify(actual) === JSON.stringify(expected);
    }, query);
    check(
      "поиск «" + query + "»: точный набор песен из исходных метаданных",
      match,
    );
  }

  await page.evaluate(() => T.click(document.getElementById("searchClear")));
  check(
    "очистка поиска",
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
    (await page.$eval("#overlayInner", (n) => n.textContent)).includes(
      primary.title,
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
  // Start away from the lower boundary; catalog order may change in releases.
  await page.click(".row");
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

  // обычная песня по-прежнему играет в рамке
  const normalId = primary.id;
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
    (skip) =>
      window.__catalog.find(
        (s) => !s.noembed && !s.blocked?.includes(s.id) && s.id !== skip,
      ).id,
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
  if (!results.length)
    check("выбранный набор тестов существует", false, process.env.TEST_SUITE);
  console.log("");
  let failed = 0;
  for (const result of results) {
    if (!result.ok) failed++;
    const extra = result.extra ? `  [${result.extra}]` : "";
    if (!result.ok) console.log(` FAIL ${result.name}${extra}`);
  }

  if (jsErrors.length) console.log("\nОшибки JS:\n" + jsErrors.join("\n"));
  console.log(
    `\n${results.length - failed}/${results.length} проверок пройдено, ${jsErrors.length} ошибок JS\n`,
  );
  process.exitCode = failed || jsErrors.length ? 1 : 0;
}

run().catch((error) => {
  console.error("ТЕСТ УПАЛ:", error.message);
  process.exit(1);
});
