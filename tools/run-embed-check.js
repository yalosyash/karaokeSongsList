/**
 * Прогоняет все видео каталога через настоящий плеер YouTube в Chrome
 * и записывает, какие из них запрещено встраивать (ошибки 101/150).
 *
 * Запуск: node tools/run-embed-check.js [--limit N] [--only id1,id2]
 * Результат: tools/embeds.json
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = path.join(__dirname, "..");
const BATCH = 4;

const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
const songs = JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
let ids = [...new Set(songs.flatMap((s) => [s.id, ...(s.alt || [])]))];

const only = process.argv.indexOf("--only");
if (only > -1)
  ids = process.argv[only + 1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const limit = process.argv.indexOf("--limit");
if (limit > -1) ids = ids.slice(0, Number(process.argv[limit + 1]));

(async () => {
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
  const page = await browser.newPage();
  await page.goto("http://localhost:4173/tools/embed-check.html", {
    waitUntil: "load",
  });
  await page.waitForFunction(() => window.API_READY === true, {
    timeout: 30000,
  });

  const out = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const res = await page.evaluate((b) => window.checkBatch(b), batch);
    out.push(...Object.values(res));
    process.stdout.write(`\r${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
  console.log();
  await browser.close();

  const byCode = {};
  for (const r of out) {
    const k = r.status === "error" ? "err" + r.error : r.status;
    byCode[k] = (byCode[k] || 0) + 1;
  }
  console.log("итог:", byCode);

  const byId = new Map();
  for (const s of songs) {
    byId.set(s.id, s);
    for (const a of s.alt || []) byId.set(a, s);
  }
  const bad = out.filter((x) => x.status !== "ok");
  for (const r of bad) {
    const s = byId.get(r.id);
    console.log(
      `  ${String(r.status).padEnd(8)} ${String(r.error ?? "").padEnd(4)} ${r.id.padEnd(12)} ${s ? s.artist + " — " + s.title : "?"}`,
    );
  }

  const prev = fs.existsSync(path.join(__dirname, "embeds.json"))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, "embeds.json"), "utf8"))
    : [];
  const merged = new Map(prev.map((r) => [r.id, r]));
  for (const r of out) merged.set(r.id, r);
  fs.writeFileSync(
    path.join(__dirname, "embeds.json"),
    JSON.stringify([...merged.values()], null, 1),
    "utf8",
  );
})();
