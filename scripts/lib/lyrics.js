/* Чистка текстов песен: убираем служебные строки, повторы и мусор.
   Используется и сборкой каталога, и загрузчиком текстов. */

const NOISE = /^[\[(].*[\])]$/; // [Verse 1], (x2)
const SYMBOLS = /^[^\p{L}\p{N}]+$/u;
const MARKER =
  /^(instrumental|musical|interlude|соло|проигрыш|куплет|припев|chorus|verse|bridge|hook|outro|intro|\d+\.?)\s*$/i;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/* LRCLIB отдаёт часть строк с HTML-сущностями: "&#x2028;" вместо переноса,
   "&amp;" вместо "&". Иначе они видны в тексте как есть. */
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    })
    .replace(/&([a-z]+);/gi, (match, name) => {
      const value = NAMED_ENTITIES[name.toLowerCase()];
      return value === undefined ? match : value;
    });
}

/* Невидимые разделители строк и нулевой ширины: в тексте они не нужны. */
const INVISIBLE = /[\u2028\u2029\u200b-\u200d\ufeff]/g;

const isNoise = (line) => {
  const text = line.trim();
  if (!text) return true;
  if (NOISE.test(text)) return true;
  if (SYMBOLS.test(text)) return true;
  return MARKER.test(text);
};

/** Строки без таймкодов, служебных пометок и повторов подряд. */
export function cleanLines(plain) {
  if (!plain) return null;

  const text = decodeEntities(String(plain))
    .replace(INVISIBLE, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, ""))
    .join("\n");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !isNoise(line))
    .filter((line, i, all) => line !== all[i - 1]);

  return lines.length ? lines.slice(0, 140) : null;
}

export const lineKey = (line) =>
  line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const keyOf = (lines) => lines.map(lineKey).join("\n");

/* "1 2 3 4 1 2 3 4" -> "1 2 3 4": сворачивает блок, который повторяет сам себя. */
export function collapseRepeat(lines) {
  let out = lines;
  for (let guard = 0; guard < 5; guard++) {
    const n = out.length;
    if (n < 4 || n % 2 !== 0) break;
    const half = n / 2;
    if (keyOf(out.slice(0, half)) !== keyOf(out.slice(half))) break;
    out = out.slice(0, half);
  }
  return out;
}

/** Есть ли в припеве хоть что-то, чего не было в куплете. */
export function isContained(chorus, verse) {
  const seen = new Set(verse.map(lineKey));
  return chorus.every((line) => seen.has(lineKey(line)));
}

/**
 * Ищет припев как самый ценный повторяющийся блок подряд идущих строк,
 * а куплет берёт перед ним.
 */
function findChorus(lines) {
  const total = lines.length;
  const starts = new Map(); // "длина|текст" -> позиции

  for (let i = 0; i < total; i++) {
    for (let len = 2; len <= Math.min(10, total - i); len++) {
      const segment = keyOf(lines.slice(i, i + len));
      if (segment.length < 15) continue;
      const key = len + "|" + segment;
      if (!starts.has(key)) starts.set(key, []);
      starts.get(key).push(i);
    }
  }

  let best = null;
  for (const [key, positions] of starts) {
    if (positions.length < 2) continue;
    const len = Number(key.slice(0, key.indexOf("|")));
    const value = len * positions.length;
    if (
      !best ||
      value > best.value ||
      (value === best.value && len > best.len)
    ) {
      best = {
        first: positions[0],
        len,
        value,
        segment: lines.slice(positions[0], positions[0] + len),
      };
    }
  }
  return best;
}

/** Разбивает текст на куплет и припев для подсказки «первые слова». */
export function buildLyrics(plain) {
  const lines = cleanLines(plain);
  if (!lines) return null;

  const chorusBlock = findChorus(lines);
  const chorus = chorusBlock ? chorusBlock.segment.slice(0, 8) : null;

  let verse =
    chorusBlock && chorusBlock.first > 1
      ? lines.slice(0, Math.min(chorusBlock.first, 8))
      : lines.slice(0, Math.min(6, lines.length));
  if (verse.length > 8) verse = verse.slice(0, 8);

  const cleanedChorus =
    chorus && keyOf(chorus) !== keyOf(verse) ? chorus : null;
  return { verse, chorus: cleanedChorus };
}

/**
 * Приводит пару «куплет/припев» к виду, готовому для интерфейса:
 * убирает мусорные строки, повторы и припев, который лишь повторяет куплет.
 */
export function normalizeLyrics({ verse, chorus }) {
  let v = cleanLines(verse ? verse.join("\n") : null);
  let c = cleanLines(chorus ? chorus.join("\n") : null);

  if (v) v = collapseRepeat(v);
  if (c) c = collapseRepeat(c);

  if (v && c && isContained(c, v)) c = null;

  // Частично пересекающийся припев оставляем, но только новые строки.
  if (v && c) {
    const seen = new Set(v.map(lineKey));
    const fresh = c.filter((line) => !seen.has(lineKey(line)));
    if (fresh.length >= 2 && fresh.length < c.length) c = fresh;
  }

  return { verse: v, chorus: c };
}
