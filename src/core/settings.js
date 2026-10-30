/* Масштаб текста песни: одна CSS-переменная управляет и панелью, и оверлеем. */

import { ui } from "./state.js";
import { loadLyricScale, saveLyricScale } from "./storage.js";

const MIN = 0.7;
const MAX = 2;

function apply() {
  document.documentElement.style.setProperty(
    "--lyrics-scale",
    String(ui.lyricScale),
  );
  saveLyricScale(ui.lyricScale);
}

export function initLyricScale() {
  ui.lyricScale = loadLyricScale();
  apply();
}

export function changeLyricScale(delta) {
  const next = Math.round((ui.lyricScale + delta) * 10) / 10;
  ui.lyricScale = Math.min(MAX, Math.max(MIN, next));
  apply();
}
