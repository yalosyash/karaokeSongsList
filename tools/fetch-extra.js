const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// remaining songs + alternate query strings
const targets = [
  [
    "8gz9yOeTUWU",
    [
      "What Awaits Me Moana",
      "Moana Что меня ждёт",
      "Как далеко я уйду",
      "How Far I'll Go Moana",
    ],
  ],
  [
    "lEzg_BpVQqU",
    [
      "Отпусти и забудь",
      "Let It Go Холодное сердце",
      "Отпусти и забудь Холодное сердце",
    ],
  ],
  [
    "eKKEzd48gL0",
    [
      "Песенка Красной Шапочки",
      "Если долго долго долго",
      "Красная шапочка песенка",
    ],
  ],
  [
    "c-j9NLDRIcE",
    ["Песенка мамонтёнка", "Пусть мама услышит", "По синему морю"],
  ],
  ["3f3GQyRvJ08", ["Мама первое слово", "Мама первое слово главное слово"]],
  [
    "BMAoBpQhGps",
    [
      "Маленькая страна",
      "Есть за горами за лесами",
      "Наташа Королёва Маленькая страна",
    ],
  ],
  ["-evMeGMttEY", ["Лев и брадобрей", "Мэри Поппинс Лев и брадобрей"]],
  ["BJkcj62yhSo", ["Вдруг как в сказке", "Вдруг как в сказке скрипнула дверь"]],
  ["AWwIm0oiMoM", ["Once Upon a December", "Анастасия Once Upon a December"]],
  ["Lf60fZCpyGU", ["Смуглянка", "Как-то летом на рассвете"]],
  ["nmbS3Li6Hyg", ["Журавли", "Мне кажется порою что солдаты"]],
  ["zQq3kWXTA50", ["А закаты алые", "А закаты алые алые"]],
  ["4buSKn7Kr6E", ["Научусь летать", "МакSим Научусь летать"]],
  ["S16urtzLciY", ["Там нет меня", "Севара Там нет меня"]],
  ["hAbWiqXH3e4", ["Попытка номер 5", "ВИА Гра Попытка номер пять"]],
  ["co4Hzjd1QnY", ["Только не беги", "Нюша Только не беги"]],
  ["rbIJTQQYxuQ", ["Кислотный диджей", "Акула Кислотный диджей"]],
  ["XuftnKMxrgY", ["Щёчки", "Щечки Битеев"]],
  ["UNr8LBFH2d4", ["Были танцы", "Бьянка Были танцы"]],
  ["kz9I94J6i3M", ["Снег идёт", "Глюкоза Снег идёт", "Снег идет Глюкоза"]],
];

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
  const found = {};
  for (const [id, queries] of targets) {
    let best = null;
    for (const q of queries) {
      const arr = await api(
        "https://lrclib.net/api/search?q=" + encodeURIComponent(q),
      );
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item.plainLyrics && item.plainLyrics.trim().length > 80) {
            best = item;
            break;
          }
        }
      }
      if (best) break;
      await sleep(400);
    }
    if (best) {
      found[id] = {
        track: best.trackName,
        artist: best.artistName,
        plain: best.plainLyrics,
      };
      console.log("OK", id, "=>", best.artistName, "/", best.trackName);
    } else {
      console.log("--", id, "still nothing");
    }
  }
  fs.writeFileSync("lyrics-extra.json", JSON.stringify(found, null, 1), "utf8");
})();
