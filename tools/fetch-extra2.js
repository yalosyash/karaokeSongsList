const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = {
  zQq3kWXTA50: ["Закаты алые", "А закаты алые", "Закаты алые песня"],
  S16urtzLciY: ["Там нет меня", "Севара Там нет меня", "Там нет меня Севара"],
  co4Hzjd1QnY: ["Только не беги", "Нюша Только не беги"],
  rbIJTQQYxuQ: ["Кислотный диджей", "Акула Кислотный диджей"],
  "3f3GQyRvJ08": [
    "Мама первое слово",
    "Мама — первое слово",
    "Мама первое слово главное слово",
  ],
  "-evMeGMttEY": ["Лев и брадобрей", "Мэри Поппинс Лев и брадобрей"],
  nmbS3Li6Hyg: [
    "Журавли Бернес",
    "Мне кажется порою что солдаты",
    "Журавли Гамзатов",
  ],
  hAbWiqXH3e4: [
    "Попытка номер 5 ВИА Гра",
    "Попытка номер пять ВИА Гра",
    "ВИА Гра Попытка",
  ],
  kz9I94J6i3M: ["Снег идёт Глюкоза", "Снег идет Глюкоза"],
  Lf60fZCpyGU: [
    "Смуглянка русская",
    "Как-то летом на рассвете",
    "Смуглянка Новиков",
  ],
  "8gz9yOeTUWU": [
    "Что меня ждёт Моана",
    "Как далеко я уйду Моана",
    "Что меня ждет",
  ],
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
    const seen = [];
    for (const q of queries) {
      const arr = await api(
        "https://lrclib.net/api/search?q=" + encodeURIComponent(q),
      );
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item.plainLyrics && item.plainLyrics.trim().length > 60) {
            seen.push({
              a: item.artistName,
              t: item.trackName,
              len: item.plainLyrics.length,
            });
            if (!out[id])
              out[id] = {
                artist: item.artistName,
                track: item.trackName,
                plain: item.plainLyrics,
              };
          }
        }
      }
      await sleep(300);
    }
    console.log(
      "==",
      id,
      seen
        .slice(0, 6)
        .map((x) => `${x.a}/${x.t}(${x.len})`)
        .join(" ; "),
    );
  }
  fs.writeFileSync("lyrics-extra2.json", JSON.stringify(out, null, 1), "utf8");
})();
