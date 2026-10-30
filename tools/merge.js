const fs = require("fs");
const { join } = require("path");

const songs = JSON.parse(
  fs.readFileSync(join(__dirname, "songs.json"), "utf8").replace(/^\uFEFF/, ""),
);
const clean = JSON.parse(
  fs.readFileSync(join(__dirname, "lyrics-clean.json"), "utf8"),
);

const src = fs.readFileSync(join(__dirname, "extract.js"), "utf8");
const body = src.slice(
  src.indexOf("const isNoise"),
  src.indexOf("const out = raw.map"),
);
const mod = { exports: {} };
new Function(
  "module",
  "exports",
  "require",
  body + "\nmodule.exports = build;",
)(mod, mod.exports, require);
const build = mod.exports;

const result = new Map();
for (const c of clean) result.set(c.id, { verse: c.verse, chorus: c.chorus });

// ordered: later sources override earlier ones (they were verified manually for bad matches)
function apply(file, skip = []) {
  const d = JSON.parse(fs.readFileSync(join(__dirname, file), 'utf8'));
  for (const [id, v] of Object.entries(d)) {
    if (skip.includes(id)) continue;
    const b = build(v.plain);
    if (b && b.verse) result.set(id, b);
  }
}

apply('lyrics-extra.json');
apply('lyrics-extra2.json', ['zQq3kWXTA50']);
apply('lyrics-extra3.json', ['zQq3kWXTA50']);
apply('lyrics-extra4.json', ['3f3GQyRvJ08']);
apply('lyrics-final.json');

// hand-verified text
result.set("3f3GQyRvJ08", {
  verse: [
    "Мама — первое слово,",
    "Главное слово в каждой судьбе.",
    "Мама жизнь подарила,",
    "Мир подарила мне и тебе.",
  ],
  chorus: null,
});

const out = songs.map((s) => {
  const l = result.get(s.id) || {};
  const verse = l.verse || null;
  let chorus = l.chorus || null;
  if (chorus && verse && chorus.join(" ") === verse.join(" ")) chorus = null;
  return { ...s, verse, chorus };
});

fs.writeFileSync(
  join(__dirname, "songs-data.json"),
  JSON.stringify(out, null, 1),
  "utf8",
);
console.log("total", out.length);
console.log("no lyrics", out.filter((s) => !s.verse).length);
out
  .filter((s) => !s.verse)
  .forEach((s) => console.log("  -", s.id, s.artist, "-", s.title));
console.log("with chorus", out.filter((s) => s.chorus).length);
