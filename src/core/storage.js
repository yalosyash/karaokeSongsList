/* Единственное место, где приложение трогает localStorage.
   Приватный режим и запрет хранилища не должны ломать страницу — ошибки гасим. */

import { favorites, ui } from "./state.js";

const FAV_KEY = "karaoke.favs.v1";
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

/** Поднимает избранное и масштаб текста. Неизвестные id отбрасываются. */
export function restoreSettings(isKnownSong) {
  try {
    const saved = JSON.parse(read(FAV_KEY) || "[]");
    if (Array.isArray(saved)) {
      saved.forEach((id) => isKnownSong(id) && favorites.add(id));
    }
  } catch {}

  const scale = Number(read(SCALE_KEY));
  if (Number.isFinite(scale) && scale > 0) ui.lyricScale = scale;
}

export const saveFavorites = () =>
  write(FAV_KEY, JSON.stringify([...favorites]));

export const loadLyricScale = () => ui.lyricScale;

export const saveLyricScale = (value) => write(SCALE_KEY, String(value));

export const loadLastSong = () => read(LAST_KEY);

export const saveLastSong = (id) => write(LAST_KEY, id);
