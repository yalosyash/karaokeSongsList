/* Скриншоты основных состояний интерфейса — для проверки вёрстки глазами.

   Нужен запущенный сервер: npm start
   Запуск: npm run screenshots  → tests/screens/*.png */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "tests", "screens");
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  fs.mkdirSync(output, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 1500, height: 940, deviceScaleFactor: 1.5 },
  });

  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("http://localhost:4173/", { waitUntil: "networkidle2" });
    await page.waitForSelector(".row");
    await wait(600);

    // песня выбрана и играет
    await page.evaluate(() => {
      document
        .querySelector('.row[data-id="AJFHUiFof9M"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await wait(4000);
    await page.screenshot({ path: path.join(output, "desktop.png") });

    // текст на весь экран
    await page.evaluate(() => document.getElementById("btnFullLyrics").click());
    await wait(500);
    await page.screenshot({ path: path.join(output, "lyrics.png") });

    // мобильная раскладка
    await page.evaluate(() => document.getElementById("overlayClose").click());
    await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
    await wait(800);
    await page.screenshot({ path: path.join(output, "mobile.png") });

    console.log("ошибки JS:", errors.length ? errors : "нет");
    console.log("скриншоты:", path.relative(root, output));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
