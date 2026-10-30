/* Отрисовка списка песен: строки, заголовки групп, счётчик и пустое состояние. */

import { escapeHtml, songWord } from "../core/text.js";
import { favorites, state } from "../core/state.js";
import { el } from "../core/dom.js";
import { CATEGORY_LABELS, SONGS } from "../catalog/catalog.js";
import { currentList, hasActiveFilters } from "../catalog/filter.js";

const rowIcon = (id) => `<svg aria-hidden="true"><use href="#i-${id}" /></svg>`;

function rowHtml(song) {
  const active = song.id === state.currentId;
  const fav = favorites.has(song.id);
  const classes =
    "row" +
    (active ? " active" : "") +
    (active && state.playing ? " playing" : "");

  const badges =
    `<span class="row-badge">${escapeHtml(CATEGORY_LABELS[song.category] || song.category)}</span>` +
    (state.sort !== "genre"
      ? `<span class="row-badge">${escapeHtml(song.genre)}</span>`
      : "") +
    (song.lang === "en" ? '<span class="row-badge">EN</span>' : "");

  const external = song.noembed
    ? '<span class="row-ext" title="Играет только на YouTube" aria-label="Играет только на YouTube">↗</span>'
    : "";

  return (
    `<div class="${classes}" role="option" aria-selected="${active}"` +
    ` data-id="${song.id}" tabindex="-1" draggable="false">` +
    `<span class="row-artist">${escapeHtml(song.artist)}</span>` +
    `<span class="row-title">${escapeHtml(song.title)}</span>` +
    `<span class="row-meta">${badges}</span>` +
    `<span class="row-side">${external}` +
    `<button class="row-fav${fav ? " on" : ""}" data-fav="${song.id}" title="В избранное" aria-label="В избранное">${rowIcon("star")}</button>` +
    `<span class="row-play">${rowIcon("play")}</span>` +
    `</span>` +
    `</div>`
  );
}

/* Группировка имеет смысл только для алфавитных сортировок и разделов. */
function groupKeyOf(song) {
  switch (state.sort) {
    case "artist":
      return song.artist
        .replace(/^(the|a|an|группа)\s+/i, "")
        .charAt(0)
        .toUpperCase();
    case "title":
      return song.title.charAt(0).toUpperCase();
    case "genre":
      return song.genre;
    default:
      return song.category;
  }
}

export function updateResultCount(total) {
  el.resultCount.textContent =
    total === SONGS.length
      ? `Все песни · ${total}`
      : `Найдено ${total} ${songWord(total)} из ${SONGS.length}`;
  el.reset.hidden = !hasActiveFilters();
}

export function renderList() {
  const list = currentList();

  let html = "";
  let lastGroup = null;
  for (const song of list) {
    const key = groupKeyOf(song);
    if (key !== lastGroup) {
      html += `<div class="group-head">${escapeHtml(key)}</div>`;
      lastGroup = key;
    }
    html += rowHtml(song);
  }

  el.list.innerHTML = html;
  el.empty.hidden = list.length > 0;
  el.list.hidden = list.length === 0;

  updateResultCount(list.length);
}

/** Переключает подсветку «играет» без перерисовки всего списка. */
export function updatePlayingRows() {
  for (const row of el.list.querySelectorAll(".row")) {
    const isCurrent = row.dataset.id === state.currentId;
    row.classList.toggle("active", isCurrent);
    row.setAttribute("aria-selected", String(isCurrent));
    row.classList.toggle("playing", isCurrent && state.playing);
  }
}

export function scrollToRow(id) {
  const row = el.list.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Строки в том порядке, в котором их видит пользователь. */
export const visibleRows = () => [...el.list.querySelectorAll(".row")];
