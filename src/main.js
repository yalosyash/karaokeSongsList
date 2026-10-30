/* Точка входа: собрать состояние, отрисовать стартовый экран и навесить события.
   Логика — в src/features/*, каталог — в src/catalog/*, утилиты — в src/core/*. */

import { el } from "./core/dom.js";
import { songWord } from "./core/text.js";
import { favorites } from "./core/state.js";
import { loadLastSong, restoreSettings } from "./core/storage.js";
import { initLyricScale } from "./core/settings.js";
import { registerServiceWorker } from "./core/offline.js";
import { SONGS, byId } from "./catalog/catalog.js";
import { renderChips, renderGenreOptions } from "./features/filters.js";
import { renderList, scrollToRow } from "./features/list.js";
import { wireNowBar, wireList, wireToolbar } from "./features/controls.js";
import { wireKeyboard } from "./features/keyboard.js";
import { wireLyricsControls } from "./features/lyrics.js";
import { selectSong } from "./features/player.js";

function restoreLastSong() {
  const lastId = loadLastSong();
  if (!lastId || !byId.has(lastId)) return;
  selectSong(lastId);
  scrollToRow(lastId);
}

function init() {
  restoreSettings((id) => byId.has(id));
  initLyricScale();

  el.total.textContent = `${SONGS.length} ${songWord(SONGS.length)}`;
  renderGenreOptions();
  renderChips();
  renderList();

  wireToolbar();
  wireList();
  wireNowBar();
  wireLyricsControls();
  wireKeyboard();

  restoreLastSong();

  // избранное из прошлой сессии должно быть видно в чипе сразу
  if (favorites.size) renderChips();

  registerServiceWorker();
}

init();
