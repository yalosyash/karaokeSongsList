/* Горячие клавиши. Один обработчик на документ: порядок проверок важен,
   потому что Esc и Enter значат разное в поиске, списке и оверлее. */

import { state } from "../core/state.js";
import { el } from "../core/dom.js";
import { toggleFavorite } from "./favorites.js";
import { toggleOverlay } from "./lyrics.js";
import {
  openCurrentOnYouTube,
  play,
  restart,
  selectSong,
  stop,
} from "./player.js";
import { pickRandomSong, stepSelection } from "./actions.js";

const isTextField = (node) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName || "");

function handleSearchKeys(event) {
  // из поля поиска стрелки ведут прямо в список песен
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const row = stepSelection(direction);
    if (!row) return;
    el.search.blur();
    row.focus({ preventScroll: true });
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const rows = [...el.list.querySelectorAll(".row")];
    const pick =
      rows.find((row) => row.dataset.id === state.currentId) || rows[0];
    if (pick) {
      el.search.blur();
      selectSong(pick.dataset.id);
    }
    return true;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    el.search.blur();
    return true;
  }

  return false;
}

export function wireKeyboard() {
  document.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    const inField = isTextField(active);

    if (inField && active === el.search) {
      if (handleSearchKeys(event)) return;
      return; // всё остальное — обычный ввод в поиск
    }

    if (event.key === "/" && !inField) {
      event.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }

    if (event.key === "Escape") {
      if (!el.overlay.hidden) {
        toggleOverlay(false);
        return;
      }
      if (inField) {
        active.blur();
        return;
      }
      stop();
      return;
    }

    if (inField) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const row = stepSelection(direction);
      if (row) row.focus({ preventScroll: true });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (state.currentId) play();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!state.currentId) return;
      el.btnPlay.click();
      return;
    }

    switch (event.key.toLowerCase()) {
      case "s":
        toggleFavorite(state.currentId);
        return;
      case "f":
        toggleOverlay();
        return;
      case "r":
        pickRandomSong();
        return;
      case "y":
        openCurrentOnYouTube();
        return;
      case "0":
        restart();
        return;
    }
  });
}
