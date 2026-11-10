import { preparePage, ready, diagnostics } from "./support.js";

// Fixed edge-case inputs; only catalog data is controlled here. The production
// HTML, filters, keyboard handlers, player and lyric renderer execute unchanged.
export const edgeSongs = [
  {
    id: "normal00001",
    artist: "Тест",
    title: "Обычная песня",
    category: "Русский рок",
    genre: "Хард-рок",
    lang: "ru",
    alt: [],
    blocked: [],
    verse: ["Первая строка"],
    chorus: ["Припев & <слова>"],
    search: "тест обычная песня русский рок хард рок",
    searchAlt: "тест обычная песня русский рок хард рок",
  },
  {
    id: "blocked0001",
    artist: "Тест",
    title: "Только YouTube",
    category: "Зарубежная музыка",
    genre: "Поп",
    lang: "en",
    alt: [],
    blocked: ["blocked0001"],
    noembed: true,
    verse: null,
    chorus: null,
    search: "тест только youtube поп",
    searchAlt: "тест только youtube поп",
  },
  {
    id: "version0001",
    artist: "Тест",
    title: "Три версии",
    category: "Русский рок",
    genre: "Хард-рок",
    lang: "ru",
    alt: ["blocked0002", "working0003"],
    blocked: ["blocked0002"],
    verse: null,
    chorus: ["Только припев"],
    search: "тест три версии хард рок",
    searchAlt: "тест три версии хард рок",
  },
];

export async function playerContractSteps(browser, base, check) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const expect = async (name, predicate) => {
    try {
      await page.waitForFunction(predicate, { timeout: 5000 });
      check(name, true);
    } catch (error) {
      check(name, false, error.message);
      throw error;
    }
  };
  try {
    await page.setViewport({ width: 1500, height: 940 });
    await preparePage(page, base, { catalog: edgeSongs });
    await ready(page, base);
    await page.click('.chip[data-cat="Русский рок"]');
    await expect(
      "контракт: категория отбирает ровно две ожидаемые песни",
      () =>
        JSON.stringify(
          [...document.querySelectorAll(".row")]
            .map((n) => n.dataset.id)
            .sort(),
        ) === JSON.stringify(["normal00001", "version0001"]),
    );
    await page.click('.chip[data-cat="Русский рок"]');
    await expect(
      "контракт: повторный выбор категории возвращает весь список",
      () =>
        document.querySelectorAll(".row").length === 3 &&
        document
          .querySelector('.chip[data-cat=""]')
          .getAttribute("aria-selected") === "true",
    );
    await page.evaluate(() => {
      window.opened = [];
      window.open = (...args) => window.opened.push(args);
    });
    await page.click('[data-id="normal00001"]');
    await expect(
      "контракт: слова экранированы и показаны без потери символов",
      () =>
        document
          .getElementById("lyricsBody")
          .textContent.includes("Припев & <слова>") &&
        !document.querySelector("#lyricsBody слова"),
    );
    await page.click('[data-id="blocked0001"]');
    await expect(
      "контракт: отсутствие текста показано явно",
      () => !!document.querySelector("#lyricsBody .lyr-none"),
    );
    await page.click("#btnPlay");
    await expect(
      "контракт: полностью заблокированное видео не загружается и само не открывает вкладку",
      () =>
        !document.getElementById("videoBlocked").hidden &&
        !document.getElementById("ytFrame").hasAttribute("src") &&
        opened.length === 0,
    );
    await page.click("#openYtBtn");
    await expect(
      "контракт: ссылка заблокированной песни ведёт на её ID",
      () =>
        opened.length === 1 &&
        opened[0][0] === "https://www.youtube.com/watch?v=blocked0001",
    );
    await page.click('[data-id="version0001"]');
    await expect(
      "контракт: песня только с припевом не теряет слова",
      () =>
        !!document.querySelector("#lyricsBody .lyr-na") &&
        document.querySelector("#lyricsBody .lyr-line:not(.lyr-na)")
          .textContent === "Только припев",
    );
    await page.click("#btnAlt");
    await page.click("#btnPlay");
    await expect(
      "контракт: версия 2/3 остаётся выбранной и открывается отдельно",
      () =>
        document.getElementById("altLabel").textContent === "Версия 2/3" &&
        !document.getElementById("videoBlocked").hidden &&
        !document.getElementById("ytFrame").hasAttribute("src") &&
        opened.length === 2 &&
        opened[1][0] === "https://www.youtube.com/watch?v=blocked0002",
    );
    await page.click("#btnPlay");
    await expect(
      "контракт: повторный запуск заблокированной версии не плодит вкладки",
      () => opened.length === 2,
    );
    await page.click("#blockedAltBtn");
    await expect(
      "контракт: возврат с заблокированной версии выбирает рабочую",
      () =>
        document.getElementById("altLabel").textContent === "Версия 3/3" &&
        !document.getElementById("ytFrame").hasAttribute("src"),
    );
    // The button advances to the next version, so 2/3 -> 3/3. Complete the
    // cycle explicitly before checking a transition from playing 1/3 to 2/3.
    await page.click("#btnAlt");
    await page.click("#btnPlay");
    await expect(
      "контракт: рабочая версия запускает правильное видео",
      () =>
        new URL(document.getElementById("ytFrame").src).pathname ===
          "/embed/version0001" && !!document.querySelector(".row.playing"),
    );
    await page.click("#btnAlt");
    await expect(
      "контракт: переход на запрещённую версию во время игры выгружает iframe",
      () =>
        !document.getElementById("ytFrame").hasAttribute("src") &&
        !document.querySelector(".row.playing") &&
        !document.getElementById("videoBlocked").hidden,
    );
    await page.click("#btnAlt");
    await page.click("#btnPlay");
    await expect(
      "контракт: третья версия запускается со своим ID",
      () =>
        new URL(document.getElementById("ytFrame").src).pathname ===
        "/embed/working0003",
    );
    await page.click("#btnStop");
    await expect(
      "контракт: стоп полностью выгружает видео",
      () =>
        !document.getElementById("ytFrame").hasAttribute("src") &&
        !document.querySelector(".row.playing"),
    );
    check(
      "контракты плеера без ошибок JavaScript",
      errors.length === 0,
      errors.join("; "),
    );
  } catch (error) {
    await diagnostics(page, "player-contracts", error);
    throw error;
  } finally {
    await context.close();
  }
}
