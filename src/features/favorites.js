/* Избранное: один источник правды для строк списка, чипа и кнопки в панели. */

import { favorites, state } from "../core/state.js";
import { saveFavorites } from "../core/storage.js";
import { el } from "../core/dom.js";
import { renderChips } from "./filters.js";
import { renderList } from "./list.js";

export function toggleFavorite(id) {
  if (!id) return;

  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();

  // обновляем все кнопки этой песни на месте, без перерисовки списка
  for (const button of el.list.querySelectorAll(
    `.row-fav[data-fav="${CSS.escape(id)}"]`,
  )) {
    button.classList.toggle("on", favorites.has(id));
  }
  if (state.currentId === id) {
    el.btnFav.classList.toggle("on", favorites.has(id));
  }

  // счётчик на чипе и, если включён фильтр «только избранное», сам список
  renderChips();
  if (state.favOnly) renderList();
}
