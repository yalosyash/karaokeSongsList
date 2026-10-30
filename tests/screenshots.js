const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
    defaultViewport: { width: 1500, height: 940, deviceScaleFactor: 1.5 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.row');
  await new Promise((r) => setTimeout(r, 600));

  // playing a song, with the video loaded
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.row')].find((x) => x.dataset.id === 'AJFHUiFof9M');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: 'final-desktop.png' });

  // fullscreen lyrics
  await page.evaluate(() => document.getElementById('btnFullLyrics').click());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: 'final-lyrics.png' });

  // mobile
  await page.evaluate(() => document.getElementById('overlayClose').click());
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: 'final-mobile.png' });

  console.log('errors:', errs.length ? errs : 'none');
  await browser.close();
})();
