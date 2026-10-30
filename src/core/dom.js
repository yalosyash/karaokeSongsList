/* Реестр DOM-узлов: одна карта id → элемент, чтобы модули не искали их по строке. */

export const $ = (id) => document.getElementById(id);

export const el = {
  /* список песен и фильтры */
  list: $("songList"),
  empty: $("listEmpty"),
  search: $("search"),
  searchClear: $("searchClear"),
  sort: $("sort"),
  chips: $("chips"),
  genre: $("genreFilter"),
  lang: $("langFilter"),
  total: $("totalCount"),
  resultCount: $("resultCount"),
  reset: $("resetFilters"),
  reset2: $("resetFilters2"),
  random: $("randomBtn"),

  /* плеер */
  frame: $("ytFrame"),
  videoShell: $("videoShell"),
  videoEmpty: $("videoEmpty"),
  videoBlocked: $("videoBlocked"),
  blockedSub: $("blockedSub"),
  openYtBtn: $("openYtBtn"),
  bigPlay: $("bigPlay"),
  emptyTitle: $("emptyTitle"),
  emptySub: $("emptySub"),

  /* панель «сейчас играет» */
  nowArtist: $("nowArtist"),
  nowTitle: $("nowTitle"),
  nowTags: $("nowTags"),
  btnPlay: $("btnPlay"),
  btnPlayLabel: $("btnPlayLabel"),
  btnRestart: $("btnRestart"),
  btnYt: $("btnYt"),
  btnFav: $("btnFav"),
  btnStop: $("btnStop"),
  btnAlt: $("btnAlt"),
  altLabel: $("altLabel"),

  /* текст песни */
  lyrics: $("lyricsBody"),
  overlay: $("lyricsOverlay"),
  overlayInner: $("overlayInner"),
  overlayClose: $("overlayClose"),
  fontPlus: $("fontPlus"),
  fontMinus: $("fontMinus"),
  btnFull: $("btnFullLyrics"),
};
