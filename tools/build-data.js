const fs = require("fs");
const { join } = require("path");

const songs = JSON.parse(
  fs
    .readFileSync(join(__dirname, "songs-data.json"), "utf8")
    .replace(/^\uFEFF/, ""),
);
const meta = JSON.parse(fs.readFileSync(join(__dirname, "meta.json"), "utf8"));
const channel = new Map(
  meta.filter((m) => m.author).map((m) => [m.id, m.author]),
);

// videos whose owner disabled embedding -> the in-page player cannot play them,
// the only honest option is a direct link to YouTube (tools/check-embeds.js fills this in)
let blockedIds = new Set();
try {
  const embeds = JSON.parse(
    fs.readFileSync(join(__dirname, "embeds.json"), "utf8"),
  );
  blockedIds = new Set(
    embeds.filter((e) => e.status !== "ok").map((e) => e.id),
  );
} catch {
  // no report yet -> assume everything embeds
}

const extraLinks = {
  tOGTcsley1U: ["UadrtR56n6s"],
  // "Ничего на свете лучше нету" and "Песенка друзей" are the same song, two videos
  GTRal5xP3aA: ["YWAlyOF4Vnc"],
};

// entries dropped because another song already covers them
const mergedAway = new Set(["YWAlyOF4Vnc"]);

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Latin letters that look Cyrillic ("МакSим" is searchable as "максим")
const LOOKALIKE = {
  a: "а",
  b: "в",
  c: "с",
  e: "е",
  h: "н",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  t: "т",
  x: "х",
  y: "у",
  s: "с",
  u: "и",
  g: "г",
  l: "л",
  d: "д",
  f: "ф",
  n: "п",
  r: "р",
  v: "в",
  w: "ш",
  z: "з",
  i: "и",
  j: "й",
};
const searchNorm = (s) =>
  norm(s)
    .split("")
    .map((ch) => LOOKALIKE[ch] || ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

// strip leading "la-la / o-e" filler lines - they don't help recall the song
const filler =
  /^[\s\-–—.,!?]*(?:(?:а|о|у|э|и|ла|да|yeah|oh|ooh|hey|na|уе|у-е)[\s\-–—.!?,]*){2,}$/i;

function cleanLines(arr) {
  if (!arr) return null;
  const out = arr.map((l) => String(l).trim()).filter(Boolean);
  while (
    out.length > 1 &&
    (filler.test(out[0]) || out[0].replace(/[^\p{L}\p{N}]/gu, "").length < 6)
  )
    out.shift();
  return out.length ? out : null;
}

const lineKey = (l) =>
  l
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// "1 2 3 4 1 2 3 4" -> "1 2 3 4": collapses a block that repeats itself
function collapseRepeat(lines) {
  let out = lines;
  for (let guard = 0; guard < 5; guard++) {
    const n = out.length;
    if (n < 4 || n % 2 !== 0) break;
    const half = n / 2;
    const a = out.slice(0, half).map(lineKey).join("\n");
    const b = out.slice(half).map(lineKey).join("\n");
    if (a !== b) break;
    out = out.slice(0, half);
  }
  return out;
}

// if every chorus line is already shown in the verse, the chorus adds nothing
function isContained(chorus, verse) {
  const vset = new Set(verse.map(lineKey));
  return chorus.every((l) => vset.has(lineKey(l)));
}

const data = songs
  .filter((s) => !mergedAway.has(s.id))
  .map((s) => {
    let verse = cleanLines(s.verse);
    let chorus = cleanLines(s.chorus);

    if (verse) verse = collapseRepeat(verse);
    if (chorus) chorus = collapseRepeat(chorus);

    // Drop a leftover "chorus" only when it merely echoes the verse (it adds no new cue),
    // and never drop the verse: that is the part she needs most.
    if (verse && chorus && isContained(chorus, verse)) chorus = null;
    // A partially-overlapping chorus still earns its place, trimmed to the lines that are new.
    if (verse && chorus) {
      const vset = new Set(verse.map(lineKey));
      const fresh = chorus.filter((l) => !vset.has(lineKey(l)));
      if (fresh.length >= 2 && fresh.length < chorus.length) chorus = fresh;
    }

    return {
      id: s.id,
      artist: s.artist,
      title: s.title,
      genre: s.genre,
      category: s.category,
      lang: s.lang,
      channel: channel.get(s.id) || null,
      alt: extraLinks[s.id] || [],
      // videos the owner does not allow to be embedded (the page opens them on YouTube)
      blocked: [s.id, ...(extraLinks[s.id] || [])].filter((id) =>
        blockedIds.has(id),
      ),
      // every version of this song is blocked -> nothing to play in-page
      noembed: [s.id, ...(extraLinks[s.id] || [])].every((id) =>
        blockedIds.has(id),
      )
        ? true
        : undefined,
      verse,
      chorus,
      search: norm(s.artist + " " + s.title + " " + s.genre + " " + s.category),
      searchAlt: searchNorm(
        s.artist + " " + s.title + " " + s.genre + " " + s.category,
      ),
    };
  });

const header =
  "/* Catalog generated from the karaoke link list. Lyrics: LRCLIB (open database). */\n";
const body =
  "window.SONGS = [\n" +
  data.map((s) => "  " + JSON.stringify(s)).join(",\n") +
  "\n];\n";
fs.writeFileSync(join(__dirname, "..", "data.js"), header + body, "utf8");

console.log(
  "songs",
  data.length,
  "| kb",
  Math.round(Buffer.byteLength(header + body) / 1024),
);
console.log("no channel", data.filter((d) => !d.channel).length);
console.log("no verse", data.filter((d) => !d.verse).length);
