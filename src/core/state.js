/* Состояние интерфейса. Один объект на всё приложение,
   чтобы фильтры, выбор и воспроизведение не расходились между модулями. */

export const state = {
  q: "",
  sort: "artist",
  category: "",
  genre: "",
  lang: "",
  currentId: null,
  playing: false,
};

/** Что происходит помимо списка: масштаб текста и открытый оверлей. */
export const ui = {
  lyricScale: 1,
  overlayOpen: false,
};
