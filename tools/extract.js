const fs = require("fs");

const raw = JSON.parse(fs.readFileSync("lyrics-raw.json", "utf8"));

const isNoise = (l) => {
  const t = l.trim();
  if (!t) return true;
  if (/^[\[(].*[\])]$/.test(t)) return true; // [Verse 1], (x2)
  if (/^[^\p{L}\p{N}]+$/u.test(t)) return true; // pure symbols / emoji
  if (
    /^(instrumental|musical|interlude|соло|проигрыш|куплет|припев|chorus|verse|bridge|hook|outro|intro|\d+\.?)\s*$/i.test(
      t,
    )
  )
    return true;
  return false;
};

function cleanLines(plain) {
  let text = String(plain).replace(/\r/g, "");
  text = text
    .split("\n")
    .map((l) =>
      l.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, "").replace(/\s+$/, ""),
    )
    .join("\n");
  let lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !isNoise(l));
  // dedupe adjacent identical lines
  lines = lines.filter((l, i) => l !== lines[i - 1]);
  return lines.slice(0, 140);
}

const key = (arr) =>
  arr
    .join("\n")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\n]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function analyze(lines) {
  // find the most valuable repeated sequence of consecutive lines (the chorus)
  const N = lines.length;
  const starts = new Map(); // key -> [start positions]
  for (let i = 0; i < N; i++) {
    for (let L = 2; L <= Math.min(10, N - i); L++) {
      const k = L + "|" + key(lines.slice(i, i + L));
      if (k.length < 15) continue;
      if (!starts.has(k)) starts.set(k, []);
      starts.get(k).push(i);
    }
  }

  let best = null;
  for (const [k, positions] of starts) {
    if (positions.length < 2) continue;
    const L = Number(k.slice(0, k.indexOf("|")));
    const first = positions[0];
    const value = L * positions.length;
    if (!best || value > best.value || (value === best.value && L > best.len)) {
      best = {
        first,
        len: L,
        count: positions.length,
        value,
        seg: lines.slice(first, first + L),
      };
    }
  }

  return best;
}

function build(plain) {
  const lines = cleanLines(plain);
  if (!lines.length) return null;

  const rep = analyze(lines);
  let chorus = null;
  let chorusStart = -1;
  if (rep) {
    chorus = rep.seg.slice(0, 8);
    chorusStart = rep.first;
  }

  let verse;
  if (chorusStart > 1) {
    verse = lines.slice(0, Math.min(chorusStart, 8));
  } else {
    verse = lines.slice(0, Math.min(6, lines.length));
  }
  if (!verse.length) verse = lines.slice(0, 6);

  // trim verse to a sensible stanza boundary: keep 4..8 lines
  if (verse.length > 8) verse = verse.slice(0, 8);

  if (chorus && key(chorus) === key(verse)) chorus = null;
  return { verse, chorus };
}

const out = raw.map((r) => {
  let res = r.plain ? build(r.plain) : { verse: r.verse, chorus: r.chorus };
  if (!res || !res.verse) res = { verse: r.verse, chorus: r.chorus };
  return { id: r.id, verse: res.verse, chorus: res.chorus };
});

fs.writeFileSync("lyrics-clean.json", JSON.stringify(out, null, 1), "utf8");
console.log(
  "songs",
  out.length,
  "with verse",
  out.filter((o) => o.verse).length,
  "with chorus",
  out.filter((o) => o.chorus).length,
);
