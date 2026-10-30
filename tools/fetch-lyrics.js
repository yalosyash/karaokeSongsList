const fs = require("fs");

const songs = JSON.parse(
  fs.readFileSync("songs.json", "utf8").replace(/^\uFEFF/, ""),
);

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const alias = {
  eKKEzd48gL0: ["Песенка Красной шапочки"],
  "c-j9NLDRIcE": ["Песенка мамонтёнка"],
  BMAoBpQhGps: ["Маленькая страна"],
  Gb6VjEeOnMY: ["Ветер перемен"],
  "H-MkOvtde64": ["Belle"],
  nmbS3Li6Hyg: ["Журавли"],
  "3f3GQyRvJ08": ["Мама первое слово"],
  YWAlyOF4Vnc: ["Песенка друзей"],
  cvWHvyQewXY: ["Песня разбойников"],
  JhFgEu9O1dw: ["Дуэт Трубадура и Принцессы"],
  Au17S0eNQ5o: ["Дуэт короля и принцессы"],
  D6MsxgYxrVc: ["Хлопья летят наверх"],
  _p_QogSpTLs: ["На Титанике"],
  OjB9753vwzY: ["Кабан"],
  XuftnKMxrgY: ["Щечки"],
  "h-ivKWZO_Qk": ["Возле дома твоего"],
  lECYppmMCpQ: ["Мы с тобой"],
  kmPvUhLpZeY: ["Белая ночь"],
  oPhWfG2WDp8: ["До рассвета"],
  Sp4kJQfCmWw: ["Этот мир"],
  BOpRZ6tr5cY: ["Сотри его из memory"],
  e3C8Nh3DIwA: ["Hallelujah"],
  XaRyJVXclvY: ["Warrior"],
  "mNL7iE-CxXA": ["Cups"],
  gmzJKb2rf4E: ["Can't Help Falling in Love"],
  u_072m3oWT0: ["Can't Take My Eyes Off You"],
  exPFJVbIz0c: ["Old Town Road"],
  C9SNun4BA7E: [],
};

const stripFeat = (s) =>
  String(s)
    .replace(/\s*(&|ft\.|feat\.|x)\s.*$/i, "")
    .trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "songList/1.0 (karaoke catalog)" },
        signal: AbortSignal.timeout(25000),
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("status " + r.status);
      const txt = await r.text();
      return JSON.parse(txt);
    } catch (e) {
      if (i === tries - 1) return null;
      await sleep(1000 * (i + 1));
    }
  }
}

function score(item, artist, title) {
  const a = norm(item.artistName);
  const t = norm(item.trackName);
  const wantA = norm(stripFeat(artist));
  const wantT = norm(title);
  let s = 0;
  if (t === wantT) s += 60;
  else if (t.includes(wantT) || wantT.includes(t)) s += 35;
  if (a === wantA) s += 40;
  else if (a.includes(wantA) || wantA.includes(a)) s += 22;
  if (!item.plainLyrics) s -= 300;
  if (item.instrumental) s -= 300;
  return s;
}

const isChorusLine = (l) => {
  const t = l.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  return (
    /^[\[(]?(припев|chorus|hook)[\])]?[:\s!.]*$/i.test(lower) ||
    /^(припев|chorus)\b/i.test(lower)
  );
};

function extract(plain) {
  let text = String(plain).replace(/\r/g, "");
  text = text
    .split("\n")
    .map((l) => l.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, "").trimEnd())
    .join("\n");
  const lines = text.split("\n");

  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (cur.length) {
        blocks.push({ type: "text", lines: cur });
        cur = [];
      }
    } else if (isChorusLine(l)) {
      if (cur.length) {
        blocks.push({ type: "text", lines: cur });
        cur = [];
      }
      blocks.push({ type: "marker", lines: [] });
    } else {
      cur.push(l);
    }
  }
  if (cur.length) blocks.push({ type: "text", lines: cur });
  if (!blocks.length) return null;

  const texts = blocks.filter((b) => b.type === "text");
  if (!texts.length) return null;

  let verse = texts[0].lines;
  let chorus = null;

  // explicit markers
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "marker") {
      const next = blocks.slice(i + 1).find((b) => b.type === "text");
      if (next) {
        chorus = next.lines;
        break;
      }
    }
  }

  // repeated-block detection
  if (!chorus) {
    const key = (b) =>
      b.lines.join("\n").toLowerCase().replace(/\s+/g, " ").trim();
    const counts = new Map();
    for (const b of texts) counts.set(key(b), (counts.get(key(b)) || 0) + 1);
    let best = null,
      bestC = 1;
    for (const b of texts) {
      const c = counts.get(key(b));
      if (c >= bestC && c > 1 && b.lines.length >= 2) {
        if (c > bestC || !best || texts.indexOf(b) < texts.indexOf(best)) {
          bestC = c;
          best = b;
        }
      }
    }
    if (best) chorus = best.lines;
  }

  const clean = (arr, max) => {
    if (!arr) return null;
    const l = arr
      .filter((x) => x.trim() && !/^[\[(]/.test(x.trim()))
      .slice(0, max);
    return l.length ? l : null;
  };

  const v = clean(verse, 8);
  let c = clean(chorus, 8);
  // if chorus equals the verse, skip it (would be redundant)
  if (v && c && v.join("\n") === c.join("\n")) c = null;

  return { verse: v, chorus: c };
}

(async () => {
  const CONC = 5;
  const out = new Array(songs.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= songs.length) return;
      const s = songs[i];
      const titles = [s.title, ...(alias[s.id] || [])];
      let best = null,
        bestScore = -1;

      for (const title of titles) {
        const a = stripFeat(s.artist);
        const url =
          "https://lrclib.net/api/search?artist_name=" +
          encodeURIComponent(a) +
          "&track_name=" +
          encodeURIComponent(title);
        const res = await api(url);
        const arr = Array.isArray(res) ? res : [];
        for (const item of arr) {
          const sc = score(item, s.artist, title) + (title === s.title ? 5 : 0);
          if (sc > bestScore) {
            bestScore = sc;
            best = item;
          }
        }
      }

      if (!best || bestScore < 60) {
        const res = await api(
          "https://lrclib.net/api/search?q=" +
            encodeURIComponent(stripFeat(s.artist) + " " + s.title),
        );
        const arr = Array.isArray(res) ? res : [];
        for (const item of arr) {
          const sc = score(item, s.artist, s.title);
          if (sc > bestScore) {
            bestScore = sc;
            best = item;
          }
        }
      }

      const ex = best && best.plainLyrics ? extract(best.plainLyrics) : null;
      out[i] = {
        id: s.id,
        matched: best
          ? { track: best.trackName, artist: best.artistName, score: bestScore }
          : null,
        verse: ex && ex.verse,
        chorus: ex && ex.chorus,
        plain: best && best.plainLyrics ? best.plainLyrics : null,
      };
      done++;
      console.log(
        ex && ex.verse ? "OK " : "---",
        s.artist,
        "-",
        s.title,
        best
          ? "=> " +
              best.artistName +
              " / " +
              best.trackName +
              " (" +
              bestScore +
              ")"
          : "(none)",
      );
      if (done % 10 === 0)
        fs.writeFileSync(
          "lyrics-raw.json",
          JSON.stringify(out.filter(Boolean), null, 1),
          "utf8",
        );
    }
  }

  await Promise.all(Array.from({ length: CONC }, worker));
  const order = new Map(songs.map((s, i) => [s.id, i]));
  const res = out
    .filter(Boolean)
    .sort((a, b) => order.get(a.id) - order.get(b.id));
  fs.writeFileSync("lyrics-raw.json", JSON.stringify(res, null, 1), "utf8");
  console.log(
    "\nwith lyrics:",
    res.filter((o) => o.verse).length,
    "/",
    res.length,
  );
})();
