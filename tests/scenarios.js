// Independent browser context: settings and service worker cannot leak from UI tests.
export async function scenarioSteps(browser, base, check) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith(base)) request.continue();
    else request.respond({ status: 200, contentType: "text/html", body: "" });
  });
  const expect = async (name, predicate, ...args) =>
    check(name, await page.evaluate(predicate, ...args));
  const click = (selector) => page.click(selector);
  const key = async (value) => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(value);
  };
  const search = async (value) => {
    await page.focus("#search");
    await page.$eval("#search", (node) => { node.value = ""; node.dispatchEvent(new Event("input")); });
    await page.type("#search", value);
  };
  const ready = async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForSelector(".row");
  };
  try {
    await page.setViewport({ width: 1500, height: 940 });
    await ready();
    await expect("первый запуск: нет выбора, управление отключено", () =>
      !document.querySelector(".row.active") &&
      ["btnPlay", "btnStop", "btnRestart", "btnYt"].every((id) => document.getElementById(id).disabled));

    // Every existing combination, including empty intersections. Compare IDs, not counts.
    const matrix = await page.evaluate(async () => {
      const { SONGS } = await import("/data/catalog.js");
      const failures = [];
      let cases = 0;
      const change = (id, value) => {
        const node = document.getElementById(id);
        node.value = value;
        node.dispatchEvent(new Event("change"));
      };
      for (const category of ["", ...new Set(SONGS.map((s) => s.category))]) {
        document.querySelector(`.chip[data-cat="${category}"]`).click();
        for (const genre of ["", ...new Set(SONGS.map((s) => s.genre))]) {
          change("genreFilter", genre);
          for (const lang of ["", "ru", "en"]) {
            change("langFilter", lang);
            const expected = SONGS.filter((s) => (!category || s.category === category) && (!genre || s.genre === genre) && (!lang || s.lang === lang)).map((s) => s.id).sort();
            const actual = [...document.querySelectorAll(".row")].map((r) => r.dataset.id).sort();
            cases++;
            if (JSON.stringify(expected) !== JSON.stringify(actual) || document.getElementById("listEmpty").hidden !== !!expected.length)
              failures.push({ category, genre, lang });
          }
        }
        document.getElementById("resetFilters").click();
      }
      return { cases, failures };
    });
    check(`все пересечения категории, жанра и языка (${matrix.cases})`, !matrix.failures.length, JSON.stringify(matrix.failures));
    const catalogChecks = await page.evaluate(async () => {
      const { SONGS } = await import("/data/catalog.js");
      const compare = new Intl.Collator("ru", { sensitivity: "base", numeric: true }).compare;
      const artist = (a, b) => compare(a.artist, b.artist) || compare(a.title, b.title);
      const categories = ["Русская поп-музыка", "Русский рок", "Зарубежная музыка", "Детские и мультфильмы", "Саундтреки и мюзиклы", "Советская эстрада и кино", "Военные и народные"];
      const checks = [];
      for (const [mode, sorter] of Object.entries({
        artist,
        title: (a, b) => compare(a.title, b.title) || compare(a.artist, b.artist),
        genre: (a, b) => compare(a.genre, b.genre) || artist(a, b),
        category: (a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || artist(a, b),
      })) {
        const sort = document.getElementById("sort");
        sort.value = mode;
        sort.dispatchEvent(new Event("change"));
        checks.push([`точный порядок всех песен: ${mode}`, JSON.stringify([...document.querySelectorAll(".row")].map((r) => r.dataset.id)) === JSON.stringify([...SONGS].sort(sorter).map((s) => s.id))]);
      }
      let valid = true;
      let versions = true;
      for (const song of SONGS) {
        document.querySelector(`.row[data-id="${song.id}"]`).click();
        const lines = [...document.querySelectorAll("#lyricsBody .lyr-line:not(.lyr-na)")].map((n) => n.textContent);
        valid &&= JSON.stringify(lines) === JSON.stringify([...(song.verse || []), ...(song.chorus || [])]);
        valid &&= document.getElementById("overlayInner").textContent.includes(song.title);
        if (!song.verse && !song.chorus) valid &&= !!document.querySelector("#lyricsBody .lyr-none");
        if (song.alt?.length) {
          for (let i = 0; i <= song.alt.length; i++) {
            versions &&= document.getElementById("altLabel").textContent === `Версия ${i + 1}/${song.alt.length + 1}`;
            document.getElementById("btnAlt").click();
            versions &&= !document.getElementById("ytFrame").hasAttribute("src");
          }
          versions &&= document.getElementById("altLabel").textContent === `Версия 1/${song.alt.length + 1}`;
        } else versions &&= document.getElementById("btnAlt").hidden;
      }
      checks.push(["точные строки куплета и припева всех песен, заголовки оверлея", valid]);
      checks.push(["все альтернативные версии: полный цикл без автозапуска", versions]);
      return checks;
    });
    for (const [name, valid] of catalogChecks) check(name, valid);
    // Return to a genuinely fresh state before the empty-list checks.
    await page.evaluate(() => localStorage.clear());
    await ready();
    await search("__нет_такой_песни__");
    await key("r");
    await page.keyboard.press("ArrowDown");
    await expect("пустой результат: случайный выбор и стрелки безопасны", () => !document.querySelector(".row.active") && !document.getElementById("listEmpty").hidden);
    await click("#resetFilters2");
    await search("Adele Skyfall");
    await page.keyboard.press("Enter");
    await expect("Enter в поиске выбирает без запуска", () => !!document.querySelector(".row.active") && !document.getElementById("ytFrame").getAttribute("src"));
    await key("ArrowDown");
    await key("ArrowUp");
    await expect("стрелки не выходят за границы одного результата", () => document.querySelectorAll(".row").length === 1 && !!document.querySelector(".row.active"));
    await key("r");
    await expect("случайный выбор из одного результата сохраняет песню", () => document.getElementById("nowTitle").textContent === "Skyfall");
    await key("Enter");
    // Same-origin transport double; the real iframe URL remains available for assertions.
    await page.$eval("#ytFrame", (frame) => new Promise((resolve) => {
      frame.onload = resolve;
      frame.srcdoc = "<!doctype html><title>Player transport</title>";
    }));
    await page.evaluate(() => {
      window.commands = [];
      document.getElementById("ytFrame").contentWindow.postMessage = (data) => window.commands.push(JSON.parse(data));
      window.opened = [];
      window.open = (...args) => window.opened.push(args);
    });
    await key("Space");
    await expect("Space ставит на паузу и отправляет команду YouTube", () => commands.at(-1).func === "pauseVideo" && !document.querySelector(".row.playing"));
    await click("#btnPlay");
    await expect("продолжение без перезагрузки видео", () => commands.at(-1).func === "playVideo" && !!document.querySelector(".row.playing"));
    await click(".row.active");
    await expect("клик по играющей строке ставит на паузу", () => commands.at(-1).func === "pauseVideo");
    for (const action of [() => key("0"), () => click("#btnRestart")]) {
      await action();
      await expect("перезапуск перематывает к началу", () => commands.at(-1).func === "seekTo" && commands.at(-1).args[0] === 0 && !!document.querySelector(".row.playing"));
    }
    await key("y");
    await click("#btnYt");
    await expect("Y и кнопка открывают выбранное видео безопасной вкладкой", () => opened.length === 2 && opened.every(([url, target, features]) => url.endsWith(document.querySelector(".row.active").dataset.id) && target === "_blank" && features === "noopener"));
    await key("f");
    await key("Escape");
    await expect("Escape сначала закрывает текст, сохраняя воспроизведение", () => document.getElementById("lyricsOverlay").hidden && !!document.querySelector(".row.playing"));
    await search("rfy0");
    await expect("горячие клавиши не срабатывают при вводе поиска", () => document.getElementById("lyricsOverlay").hidden && !!document.getElementById("ytFrame").getAttribute("src"));
    await page.keyboard.press("Escape");
    await expect("Escape в поиске только снимает фокус", () => document.activeElement.id !== "search" && !!document.getElementById("ytFrame").getAttribute("src"));
    await key("Escape");
    await expect("второй Escape полностью выгружает видео", () => document.getElementById("ytFrame").hidden && !document.getElementById("ytFrame").hasAttribute("src"));
    await click("#searchClear");
    await click("#randomBtn");
    const selected = await page.$eval(".row.active", (node) => node.dataset.id);
    await key("r");
    await expect("случайная песня не повторяется и не запускается", (id) => document.querySelector(".row.active").dataset.id !== id && !document.getElementById("ytFrame").hasAttribute("src"), selected);
    const last = await page.$eval(".row.active", (node) => node.dataset.id);
    for (const [button, expected] of [["fontPlus", "2"], ["fontMinus", "0.7"]]) {
      await page.$eval(`#${button}`, (node) => { for (let i = 0; i < 30; i++) node.click(); });
      await expect(`граница масштаба ${expected}`, (value) => document.documentElement.style.getPropertyValue("--lyrics-scale") === value, expected);
    }
    await ready();
    await expect("перезагрузка восстанавливает песню и масштаб без автозапуска", (id) => document.querySelector(".row.active")?.dataset.id === id && document.documentElement.style.getPropertyValue("--lyrics-scale") === "0.7" && !document.getElementById("ytFrame").hasAttribute("src"), last);
    await page.evaluate(() => { localStorage.setItem("karaoke.last.v1", "deleted"); localStorage.setItem("karaoke.scale.v1", "broken"); localStorage.setItem("karaoke.theme.v1", "unknown"); });
    await ready();
    await expect("повреждённые настройки и удалённая песня: безопасный первый экран", () => !document.querySelector(".row.active") && document.documentElement.dataset.theme === "original" && document.documentElement.style.getPropertyValue("--lyrics-scale") === "1");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.setOfflineMode(true);
    await ready();
    await search("Skyfall");
    await click(".row");
    await expect("офлайн после первого посещения: каталог, поиск и тексты доступны", () => document.querySelectorAll(".row").length === 1 && !!document.querySelector("#lyricsBody .lyr-line"));
    await page.setOfflineMode(false);
    await page.evaluateOnNewDocument(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    });
    await ready();
    await click(".row");
    await click("#fontPlus");
    await expect("запрет localStorage не мешает выбору и настройкам", () => !!document.querySelector(".row.active") && document.documentElement.style.getPropertyValue("--lyrics-scale") === "1.1");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await ready();
    await search("Skyfall");
    await click(".row");
    await click("#btnPlay");
    await expect("мобильный сценарий: поиск, выбор, запуск нужного видео", () => document.getElementById("ytFrame").src.includes(document.querySelector(".row.active").dataset.id) && !!document.querySelector(".row.playing"));
    await click("#btnFullLyrics");
    await expect("мобильный сценарий: текст открывается поверх плеера", () => !document.getElementById("lyricsOverlay").hidden && !!document.querySelector("#overlayInner .lyr-line"));
    await click("#overlayClose");
    await click("#btnStop");
    await expect("мобильный сценарий: закрытие текста и остановка", () => document.getElementById("lyricsOverlay").hidden && !document.getElementById("ytFrame").hasAttribute("src"));
    check("дополнительные сценарии без ошибок JavaScript", errors.length === 0, errors.join("; "));
  } finally {
    await context.close();
  }
}
