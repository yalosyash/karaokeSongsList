/* Каталог в памяти: индекс по id, группы для фильтров, сортировки.
   Готовые строки поиска лежат в данных (data/catalog.js), поэтому фильтрация —
   это один проход по массиву без нормализации на каждый клик. */

import { SONGS } from "../../data/catalog.js";
import { collator, norm, searchNorm } from "../core/text.js";

export { SONGS };

export const byId = new Map(SONGS.map((s) => [s.id, s]));

export const CATEGORY_ORDER = [
  "Русская поп-музыка",
  "Русский рок",
  "Зарубежная музыка",
  "Детские и мультфильмы",
  "Саундтреки и мюзиклы",
  "Советская эстрада и кино",
  "Военные и народные",
];

/* Короткие подписи для чипов: полное название категории не влезает в строку. */
export const CATEGORY_LABELS = {
  "Русская поп-музыка": "Поп",
  "Русский рок": "Рок",
  "Зарубежная музыка": "Зарубежное",
  "Детские и мультфильмы": "Детское",
  "Саундтреки и мюзиклы": "Саундтреки",
  "Советская эстрада и кино": "Советское",
  "Военные и народные": "Военные",
};

export function countByCategory() {
  const counts = new Map();
  for (const song of SONGS) {
    counts.set(song.category, (counts.get(song.category) || 0) + 1);
  }
  return counts;
}

export const genres = () =>
  [...new Set(SONGS.map((s) => s.genre))].sort(collator.compare);

/**
 * Готовит предикат поиска один раз на ввод, а не на каждую песню.
 * Понимает кириллицу и латиницу ("максим" → "МакSим") и несколько слов
 * в любом порядке.
 */
export function queryMatcher(query) {
  const plain = norm(query);
  if (!plain) return () => true;

  const alt = searchNorm(query);
  const words = plain.split(" ").filter(Boolean);

  return (song) => {
    if (song.search.includes(plain) || song.searchAlt.includes(alt))
      return true;
    return words.every(
      (word) => song.search.includes(word) || song.searchAlt.includes(word),
    );
  };
}

const byArtist = (a, b) =>
  collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title);

export const SORTERS = {
  artist: byArtist,
  title: (a, b) =>
    collator.compare(a.title, b.title) || collator.compare(a.artist, b.artist),
  genre: (a, b) => collator.compare(a.genre, b.genre) || byArtist(a, b),
  category: (a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    byArtist(a, b),
};
