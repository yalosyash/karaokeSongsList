const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = {
  "3f3GQyRvJ08": [
    "Мама первое слово",
    "Мама - первое слово",
    "Песня мама первое слово",
  ],
  "-evMeGMttEY": [
    "Лев и брадобрей",
    "Песня Льва и брадобрея",
    "Мэри Поппинс лев",
  ],
  zQq3kWXTA50: [
    "А закаты алые",
    "Закаты алые Волшебники двора",
    "Закаты алые песня",
  ],
  S16urtzLciY: ["Там нет меня Севара", "Севара Там нет меня", "Там нет меня"],
  co4Hzjd1QnY: ["Нюша Только не беги", "Только не беги Нюша"],
  rbIJTQQYxuQ: ["Акула Кислотный диджей", "Кислотный диджей"],
};

async function api(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "songList/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("status " + r.status);
      return JSON.parse(await r.text());
    } catch (e) {
      if (i === tries - 1) return null;
      await sleep(1200 * (i + 1));
    }
  }
}

(async () => {
  const out = {};
  for (const [id, queries] of Object.entries(targets)) {
    for (const q of queries) {
      const arr = await api(
        "https://lrclib.net/api/search?q=" + encodeURIComponent(q),
      );
      if (Array.isArray(arr)) {
        const hit = arr.find(
          (x) => x.plainLyrics && x.plainLyrics.trim().length > 120,
        );
        if (hit) {
          out[id] = {
            artist: hit.artistName,
            track: hit.trackName,
            plain: hit.plainLyrics,
          };
          console.log("OK", id, "=>", hit.artistName, "/", hit.trackName);
          break;
        }
      }
      await sleep(350);
    }
    if (!out[id]) console.log("--", id, "nothing");
  }
  fs.writeFileSync("lyrics-extra3.json", JSON.stringify(out, null, 1), "utf8");
})();
