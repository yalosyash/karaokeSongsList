/* Текст и строки: нормализация для поиска, сортировка, склонения, экранирование. */

export const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Latin letters that look like Cyrillic ones ("МакSим" -> "максим").
// Both the data and the query go through this, so typing either alphabet works.
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

export function searchNorm(s) {
  return norm(s)
    .split("")
    .map((ch) => LOOKALIKE[ch] || ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export const collator = new Intl.Collator("ru", {
  sensitivity: "base",
  numeric: true,
});

export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export const songWord = (n) => plural(n, "песня", "песни", "песен");
