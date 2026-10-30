/* Обработчики мыши и панели управления: они только связывают DOM с действиями. */

import { state } from "../core/state.js";
import { el } from "../core/dom.js";
import { toggleFavorite } from "./favorites.js";
import { handleChipClick } from "./filters.js";
import { renderList } from "./list.js";
import {
  nextVersion,
  openCurrentOnYouTube,
  pause,
  play,
  restart,
  selectSong,
  stop,
} from "./player.js";
import { clearFilters, pickRandomSong } from "./actions.js";

export function wireToolbar() {
  el.search.addEventListener("input", () => {
    state.q = el.search.value;
    el.searchClear.hidden = !state.q;
    renderList();
  });

  el.searchClear.addEventListener("click", () => {
    el.search.value = "";
    state.q = "";
    el.searchClear.hidden = true;
    renderList();
    el.search.focus();
  });

  el.sort.addEventListener("change", () => {
    state.sort = el.sort.value;
    renderList();
  });

  el.chips.addEventListener("click", handleChipClick);

  el.genre.addEventListener("change", () => {
    state.genre = el.genre.value;
    renderList();
  });

  el.lang.addEventListener("change", () => {
    state.lang = el.lang.value;
    renderList();
  });

  el.reset.addEventListener("click", clearFilters);
  el.reset2.addEventListener("click", clearFilters);
  el.random.addEventListener("click", pickRandomSong);
}

export function wireList() {
  el.list.addEventListener("click", (event) => {
    const favButton = event.target.closest(".row-fav");
    if (favButton) {
      event.stopPropagation();
      toggleFavorite(favButton.dataset.fav);
      return;
    }

    const row = event.target.closest(".row");
    if (!row) return;

    // клик по играющей песне — пауза; иначе только выбор, без видео
    if (row.dataset.id === state.currentId && state.playing) {
      pause();
      return;
    }
    selectSong(row.dataset.id);
  });

  el.list.addEventListener("dblclick", (event) => {
    const row = event.target.closest(".row");
    if (row) selectSong(row.dataset.id, { autoplay: true, force: true });
  });
}

export function wireNowBar() {
  el.bigPlay.addEventListener("click", play);

  el.btnPlay.addEventListener("click", () => {
    if (!state.currentId) return;
    if (state.playing) pause();
    else play();
  });

  el.btnRestart.addEventListener("click", restart);
  el.btnYt.addEventListener("click", openCurrentOnYouTube);
  el.openYtBtn.addEventListener("click", openCurrentOnYouTube);
  el.btnAlt.addEventListener("click", nextVersion);
  el.blockedAltBtn.addEventListener("click", nextVersion);
  el.btnFav.addEventListener("click", () => toggleFavorite(state.currentId));
  el.btnStop.addEventListener("click", stop);
}
