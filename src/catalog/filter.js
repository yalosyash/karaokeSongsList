/* Отбор песен: поиск + фильтры + сортировка. Возвращает копию массива,
   поэтому сортировка никогда не перемешивает сам каталог. */

import { SONGS, SORTERS, queryMatcher } from "./catalog.js";
import { favorites, state } from "../core/state.js";

export function currentList() {
  const matches = queryMatcher(state.q);

  const list = SONGS.filter((song) => {
    if (state.favOnly && !favorites.has(song.id)) return false;
    if (state.category && song.category !== state.category) return false;
    if (state.genre && song.genre !== state.genre) return false;
    if (state.lang && song.lang !== state.lang) return false;
    return matches(song);
  });

  return list.sort(SORTERS[state.sort] || SORTERS.artist);
}

/** Есть ли активный фильтр — от этого зависит кнопка «Сбросить». */
export const hasActiveFilters = () =>
  !!(state.q || state.category || state.genre || state.lang || state.favOnly);
