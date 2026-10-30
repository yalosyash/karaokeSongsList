const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "songList/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) throw new Error("status " + r.status);
      return JSON.parse(await r.text());
    } catch (e) {
      if (i === tries - 1) return null;
      await sleep(2000 * (i + 1));
    }
  }
}

// pick a specific result by artist/track filters
async function pick(q, filter) {
  const arr = await api(
    "https://lrclib.net/api/search?q=" + encodeURIComponent(q),
  );
  if (!Array.isArray(arr)) return null;
  const hit = arr.find(
    (x) => x.plainLyrics && x.plainLyrics.length > 100 && filter(x),
  );
  return hit
    ? { artist: hit.artistName, track: hit.trackName, plain: hit.plainLyrics }
    : null;
}

(async () => {
  const out = {};

  const jobs = [
    ["zQq3kWXTA50", "Закаты алые", (x) => /Волшебники/i.test(x.artistName)],
    [
      "Lf60fZCpyGU",
      "Смуглянка",
      (x) => /Александрова|Ансамбль/i.test(x.artistName),
    ],
    [
      "S16urtzLciY",
      "Sevara Nazarkhan Там нет меня",
      (x) => /Там нет меня/i.test(x.trackName),
    ],
    ["-evMeGMttEY", "Лев и брадобрей", () => true],
    ["co4Hzjd1QnY", "Нюша Только не беги", (x) => /не беги/i.test(x.trackName)],
  ];

  for (const [id, q, f] of jobs) {
    const r = await pick(q, f);
    if (r) {
      out[id] = r;
      console.log("OK", id, "=>", r.artist, "/", r.track);
    } else console.log("--", id, q);
    await sleep(500);
  }

  fs.writeFileSync("lyrics-final.json", JSON.stringify(out, null, 1), "utf8");
})();
