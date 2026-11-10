import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeExecutablePath, Browser } from "@puppeteer/browsers";
import { faults, applyFault } from "./faults.js";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const browserVersion = "156.0.8078.47";
export const browserCache = path.join(root, "node_modules", ".test-browser");
export const chromePath = () =>
  process.env.CHROME_PATH ||
  computeExecutablePath({
    browser: Browser.CHROME,
    buildId: browserVersion,
    cacheDir: browserCache,
  });

const transportErrors = new WeakMap();
let fontCssPromise;

async function loadFontCss() {
  const fonts = path.join(root, "node_modules", "@fontsource", "manrope");
  let css = "";
  for (const weight of [400, 500, 600, 700, 800]) {
    const source = await fs.readFile(path.join(fonts, `${weight}.css`), "utf8");
    for (const block of source.matchAll(/@font-face\s*\{[^}]+\}/g)) {
      const filename = block[0].match(/\.\/files\/([^')]+\.woff2)/)[1];
      const bytes = await fs.readFile(path.join(fonts, "files", filename));
      css += block[0].replace(
        /src:[^;]+;/,
        `src: url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');`,
      );
    }
  }
  return css;
}

export function assertTransport(page) {
  const errors = transportErrors.get(page) || [];
  if (errors.length)
    throw new Error(`Test transport failed: ${errors.join("; ")}`);
}

// Normal suites replace only external services. Edge-case suites explicitly
// supply catalog inputs; the mutation audit explicitly supplies broken modules.
// HTML, CSS and all other application code come from the real local server.
export async function preparePage(page, base, { catalog } = {}) {
  if (catalog) await page.setBypassServiceWorker(true);
  if (process.env.TEST_FAULT) await page.setBypassServiceWorker(true);
  const css = await (fontCssPromise ??= loadFontCss());
  const baseOrigin = new URL(base).origin;
  const errors = [];
  transportErrors.set(page, errors);
  await page.evaluateOnNewDocument(() => {
    window.commands = [];
    window.playerReady = false;
    window.addEventListener("message", (event) => {
      if (
        event.origin !== "https://www.youtube-nocookie.com" ||
        event.source !== document.getElementById("ytFrame")?.contentWindow
      )
        return;
      if (event.data?.testPlayerReady) window.playerReady = true;
      if (event.data?.testPlayerCommand)
        window.commands.push(event.data.testPlayerCommand);
    });
  });
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    try {
      const url = new URL(request.url());
      const fault = faults[process.env.TEST_FAULT];
      if (
        catalog &&
        url.origin === baseOrigin &&
        url.pathname === "/data/catalog.js"
      ) {
        await request.respond({
          status: 200,
          contentType: "text/javascript",
          body: `export const SONGS = ${JSON.stringify(catalog)};`,
        });
      } else if (
        fault &&
        url.origin === baseOrigin &&
        url.pathname === `/${fault.file}`
      ) {
        const source = await fs.readFile(path.join(root, fault.file), "utf8");
        const body = applyFault(source, fault);
        console.log(`MUTATION APPLIED: ${process.env.TEST_FAULT}`);
        await request.respond({
          status: 200,
          contentType: "text/javascript",
          body,
        });
      } else if (url.origin === baseOrigin || url.protocol === "data:")
        await request.continue();
      else if (url.hostname === "fonts.googleapis.com")
        await request.respond({
          status: 200,
          contentType: "text/css",
          body: css,
        });
      else if (
        url.origin === "https://www.youtube-nocookie.com" &&
        url.pathname.startsWith("/embed/")
      ) {
        await request.respond({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html><script>
          addEventListener('message', event => {
            if (event.source !== parent) return;
            try { parent.postMessage({testPlayerCommand: JSON.parse(event.data)}, '*'); } catch {}
          });
          parent.postMessage({testPlayerReady: true}, '*');
        </script>`,
        });
      } else await request.abort("blockedbyclient");
    } catch (error) {
      if (!page.isClosed()) {
        errors.push(error.message);
        await request.abort().catch(() => {});
      }
    }
  });
}

export async function ready(page, base) {
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector(".row");
  await page.evaluate(() => document.fonts.ready);
  assertTransport(page);
}

export async function diagnostics(page, label, error) {
  const directory =
    process.env.TEST_ARTIFACT_DIR ||
    path.join(root, "tests", "artifacts", `${Date.now()}-${process.pid}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, `${label}.txt`),
    String(error?.stack || error),
  );
  if (page && !page.isClosed()) {
    await page
      .screenshot({
        path: path.join(directory, `${label}.png`),
        fullPage: true,
      })
      .catch(() => {});
    await fs.writeFile(
      path.join(directory, `${label}.html`),
      await page.content().catch(() => ""),
    );
  }
  console.error(`Диагностика: ${directory}`);
}
