/* Общие действия интерфейса, которые вызывают и мышь, и клавиатура. */

import { state } from "../core/state.js";
import { el } from "../core/dom.js";
import { currentList } from "../catalog/filter.js";
import { renderChips } from "./filters.js";
import { renderList, scrollToRow, visibleRows } from "./list.js";
import { selectSong } from "./player.js";

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
  state.favOnly = false;

  el.search.value = "";
  el.genre.value = "";
  el.lang.value = "";
  el.searchClear.hidden = true;

  renderChips();
  renderList();
}

/** Перемещение по списку с клавиатуры; возвращает выбранную строку. */
export function stepSelection(direction) {
  const rows = visibleRows();
  if (!rows.length) return null;

  const current = rows.findIndex((row) => row.dataset.id === state.currentId);
  const next =
    current === -1
      ? direction > 0
        ? 0
        : rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, current + direction));

  selectSong(rows[next].dataset.id);
  scrollToRow(rows[next].dataset.id);
  return rows[next];
}
