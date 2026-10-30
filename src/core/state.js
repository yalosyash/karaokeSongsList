/* Состояние интерфейса и избранное. Один объект на всё приложение,
   чтобы фильтры, выбор и воспроизведение не расходились между модулями. */

export const state = {
  q: "",
  sort: "artist",
  category: "",
  genre: "",
  lang: "",
  favOnly: false,
  currentId: null,
  playing: false,
};

/** id песен, добавленных в избранное */
export const favorites = new Set();

/** Что происходит помимо списка: масштаб текста и открытый оверлей. */
export const ui = {
  lyricScale: 1,
  overlayOpen: false,
};
