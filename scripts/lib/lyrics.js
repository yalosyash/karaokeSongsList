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
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&([a-z]+);/gi, (match, name) => {
      const value = NAMED_ENTITIES[name.toLowerCase()];
      return value === undefined ? match : value;
    });
}

const SECTION_HEADING =
  /^(verse|chorus|куплет|припев|intro|outro|bridge|pre-chorus|post-chorus|hook|interlude|instrumental|solo|breakdown|бридж|предприпев|вступление|проигрыш|соло)(?:\s+(\d+))?(?:\s*:\s*(.+))?$/i;
const POSSIBLE_ATTRIBUTED_HEADING =
  /^\p{L}[\p{L}\p{N}\p{M}\s-]*:(?:\s+\S|\p{L})/u;
const INLINE_ANNOTATION = /^spoken$/i;
const REPEAT_MARKER = /(?:\(\s*[xх×]\s*\d+\s*\)|(?:^|\s)[xх×]\s*\d+)$/i;

/** Выбирает первые явно размеченные куплет и припев, независимо от их порядка. */
export function buildLyrics(plain) {
  const sections = {};
  let current;
  for (const line of decodeEntities(String(plain ?? "")).split(
    /\r\n?|\n|[\u2028\u2029]/,
  )) {
    const text = line.trim();
    const brackets = text.match(/^\[([^\]]+)\]$/);
    const endsWithColon = text.endsWith(":");
    const label = (
      brackets?.[1] ?? (endsWithColon ? text.slice(0, -1) : text)
    ).trim();
    const heading = label.match(SECTION_HEADING);
    if (heading && (brackets || endsWithColon || heading[2] || heading[3])) {
      const [, type, number] = heading;
      const name = type.toLowerCase();
      let section;
      if (name === "verse" || name === "куплет") section = "verse";
      if (name === "chorus" || name === "припев") section = "chorus";
      const isFirst = number === undefined || Number(number) === 1;
      current =
        section && isFirst && !sections[section]
          ? (sections[section] = [])
          : null;
    } else if (current && text) {
      if (brackets && INLINE_ANNOTATION.test(label)) continue;
      // Не угадываем границы неизвестного раздела или область повтора.
      if (
        brackets ||
        endsWithColon ||
        POSSIBLE_ATTRIBUTED_HEADING.test(text) ||
        REPEAT_MARKER.test(text)
      ) {
        return null;
      }
      current.push(text);
    }
  }
  const hasWords = (lines) => lines?.some((line) => /[\p{L}\p{N}]/u.test(line));
  return hasWords(sections.verse) && hasWords(sections.chorus)
    ? sections
    : null;
}
