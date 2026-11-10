import { install, Browser } from "@puppeteer/browsers";
import { browserVersion, browserCache } from "./support.js";
const installed = await install({
  browser: Browser.CHROME,
  buildId: browserVersion,
  cacheDir: browserCache,
});
console.log(installed.executablePath);
