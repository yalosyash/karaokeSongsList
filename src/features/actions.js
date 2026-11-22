/* Действия панели списка песен. */

import { syncDropdowns } from "./dropdowns.js";
import { state } from "../core/state.js";
import { el } from "../core/dom.js";
import { currentList } from "../catalog/filter.js";
import { renderChips } from "./filters.js";
import { renderList, scrollToRow } from "./list.js";
import { selectSong } from "./player/player.js";

/** Случайная песня из текущей выборки — только выбирает, видео не запускает. */
export function pickRandomSong() {
  const list = currentList();
  if (!list.length) return;

  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && pick.id === state.currentId) {
    pick = list[(list.indexOf(pick) + 1) % list.length];
  }

  selectSong(pick.id);
  scrollToRow(pick.id);
}

export function clearFilters() {
  state.q = "";
  state.category = "";
  state.genre = "";
  state.lang = "";

  el.search.value = "";
  el.genre.value = "";
  el.lang.value = "";
  syncDropdowns();
  el.searchClear.hidden = true;

  renderChips();
  renderList();
}
