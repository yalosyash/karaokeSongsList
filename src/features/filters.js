/* Чипы категорий и выпадающие списки жанра/языка. */

import { escapeHtml } from "../core/text.js";
import { state } from "../core/state.js";
import { el } from "../core/dom.js";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SONGS,
  countByCategory,
  genres,
} from "../catalog/catalog.js";
import { renderList } from "./list.js";

export function renderChips() {
  const counts = countByCategory();

  let html = `<button class="chip" data-cat="" aria-selected="${!state.category}">Все<span class="chip-n">${SONGS.length}</span></button>`;

  for (const category of CATEGORY_ORDER) {
    const count = counts.get(category);
    if (!count) continue;
    html +=
      `<button class="chip" data-cat="${escapeHtml(category)}" aria-selected="${state.category === category}">` +
      `${escapeHtml(CATEGORY_LABELS[category] || category)}<span class="chip-n">${count}</span></button>`;
  }

  el.chips.innerHTML = html;

  // выбранный чип должен быть виден, даже если строка прокручена
  const selected = el.chips.querySelector('.chip[aria-selected="true"]');
  if (selected)
    selected.scrollIntoView({ inline: "nearest", block: "nearest" });
}

export function renderGenreOptions() {
  el.genre.innerHTML =
    '<option value="">Все жанры</option>' +
    genres()
      .map(
        (genre) =>
          `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`,
      )
      .join("");
}

/** Клик по чипу переключает категорию. */
export function handleChipClick(event) {
  const chip = event.target.closest(".chip");
  if (!chip) return;

  const category = chip.dataset.cat || "";
  state.category = state.category === category ? "" : category;

  renderChips();
  renderList();
}
