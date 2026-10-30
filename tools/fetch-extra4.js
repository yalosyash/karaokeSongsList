const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, tries = 6) {
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
      await sleep(2000 * (i + 1));
    }
  }
}

(async () => {
  const out = {};
  const want = [["rbIJTQQYxuQ", "Кислотный DJ", "Оксана Почепа"]];
  for (const [id, track, artist] of want) {
    const arr = await api(
      "https://lrclib.net/api/search?q=" +
        encodeURIComponent(artist + " " + track),
    );
    const hit = Array.isArray(arr)
      ? arr.find((x) => x.plainLyrics && /кислотн/i.test(x.trackName))
      : null;
    if (hit) {
      out[id] = {
        artist: hit.artistName,
        track: hit.trackName,
        plain: hit.plainLyrics,
      };
      console.log("OK", id, hit.artistName, "/", hit.trackName);
    } else console.log("--", id);
  }

  // try a few for Мама / Лев
  const tries = [
    [
      "3f3GQyRvJ08",
      ["Мама", "Мама жизнь подарила", "Мама первое слово в каждой судьбе"],
    ],
    [
      "-evMeGMttEY",
      ["Лев и брадобрей", "Лев брадобрей", "Мэри Поппинс лев и брадобрей"],
    ],
  ];
  for (const [id, qs] of tries) {
    for (const q of qs) {
      const arr = await api(
        "https://lrclib.net/api/search?track_name=" + encodeURIComponent(q),
      );
      if (Array.isArray(arr)) {
        const hit = arr.find(
          (x) => x.plainLyrics && x.plainLyrics.length > 100,
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
      await sleep(500);
    }
    if (!out[id]) console.log("--", id);
  }

  fs.writeFileSync("lyrics-extra4.json", JSON.stringify(out, null, 1), "utf8");
})();
