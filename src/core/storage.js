/* Хранилище состояния приложения. Ранняя загрузка темы — отдельно в theme.js.
   Приватный режим и запрет хранилища не должны ломать страницу — ошибки гасим. */

import { ui } from "./state.js";

const SCALE_KEY = "karaoke.scale.v1";
const LAST_KEY = "karaoke.last.v1";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** Восстанавливает масштаб текста. */
export function restoreSettings() {
  const scale = Number(read(SCALE_KEY));
  if (Number.isFinite(scale) && scale > 0) ui.lyricScale = scale;
}

export const loadLyricScale = () => ui.lyricScale;

export const saveLyricScale = (value) => write(SCALE_KEY, String(value));

export const loadLastSong = () => read(LAST_KEY);

export const saveLastSong = (id) => write(LAST_KEY, id);
