/* Управление плеером: выбор песни, запуск, пауза, стоп, перезапуск, версии. */

import { favorites, state } from "../core/state.js";
import { saveLastSong } from "../core/storage.js";
import { el } from "../core/dom.js";
import { escapeHtml } from "../core/text.js";
import { byId } from "../catalog/catalog.js";
import { renderLyrics } from "./lyrics.js";
import { updatePlayingRows } from "./list.js";
import {
  embedUrl,
  isBlocked,
  isVideoBlocked,
  openOnYouTube,
  sendPlayerCommand,
  versionsOf,
} from "./player/youtube.js";

/* Какое видео сейчас лежит в iframe и какая версия выбрана для песни. */
let loadedId = null;
let altIndex = 0;
/* Для какой версии уже показано «играет только на YouTube»:
   повторный ▶ не должен открывать ещё одну вкладку. */
let blockedVideoId = null;

const currentSong = () => byId.get(state.currentId);
const activeVideoId = (song) => versionsOf(song)[altIndex] || song.id;
const currentVideoId = () => {
  const song = currentSong();
  return song ? activeVideoId(song) : null;
};

/** Версии, которые разрешено смотреть прямо на странице. */
const embeddableVersions = (song) =>
  versionsOf(song).filter((id) => !isVideoBlocked(song, id));

function setVersionLabel(song) {
  const versions = versionsOf(song);
  el.btnAlt.hidden = versions.length < 2;
  if (versions.length > 1) {
    el.altLabel.textContent = `Версия ${altIndex + 1}/${versions.length}`;
    el.btnAlt.title = isVideoBlocked(song, versions[altIndex])
      ? "Эта версия играет только на YouTube — переключить на другую"
      : "Другая версия караоке";
  }
}

function syncPlayUi() {
  el.btnPlay.classList.toggle("is-playing", state.playing);
  el.btnPlayLabel.textContent = state.playing ? "Пауза" : "Петь";
  updatePlayingRows();
}

function loadVideo(videoId, autoplay) {
  loadedId = videoId;
  blockedVideoId = null;
  el.videoEmpty.hidden = true;
  el.videoBlocked.hidden = true;
  el.videoShell.classList.remove("is-blocked");
  el.frame.hidden = false;
  el.frame.src = embedUrl(videoId, autoplay);
}

/** Полностью убирает видео со страницы: ни звука, ни скрытого воспроизведения. */
function unloadFrame() {
  sendPlayerCommand(el.frame, "stopVideo");
  loadedId = null;
  el.frame.hidden = true;
  el.frame.removeAttribute("src");
}

/** Заглушка вместо чёрного прямоугольника с ошибкой YouTube 150. */
function showBlocked(song, videoId, nonEmbeddable = false) {
  loadedId = null;
  state.playing = false;
  el.frame.hidden = true;
  el.frame.removeAttribute("src");
  el.videoEmpty.hidden = true;
  el.bigPlay.hidden = true;
  el.videoBlocked.hidden = false;
  el.videoShell.classList.add("is-blocked");
  if (song) {
    const versions = versionsOf(song);
    const version = versions.indexOf(videoId ?? activeVideoId(song));
    const label =
      version > -1 ? `Версия ${version + 1}/${versions.length}` : "Это видео";
    const hasOther = !isBlocked(song) && embeddableVersions(song).length > 0;
    const tail = nonEmbeddable
      ? "Мы открыли её в новой вкладке."
      : "Эта версия играет только на YouTube.";
    el.blockedSub.textContent = hasOther
      ? `${label} играет только на YouTube: автор запретил встраивание. ${tail}` +
        " Или переключитесь на другую версию."
      : "Автор видео запретил встраивание — здесь оно не проиграется. Откроем на YouTube.";
    el.blockedAltBtn.hidden = !hasOther;
  } else {
    el.blockedAltBtn.hidden = true;
  }
  syncPlayUi();
}

function showIdleHint(song) {
  el.emptyTitle.textContent = song.title;
  if (isBlocked(song)) {
    el.emptySub.textContent =
      "Это видео играет только на YouTube — Enter откроет его";
  } else if (isVideoBlocked(song, activeVideoId(song))) {
    // выбранная версия не встраивается — не обещаем, что ▶ её включит
    el.emptySub.textContent =
      `Версия ${altIndex + 1} играет только на YouTube — ▶ откроет её там`;
  } else {
    el.emptySub.textContent = "Нажмите ▶ — и начнём петь";
  }
}

export function selectSong(id, options = {}) {
  const song = byId.get(id);
  if (!song) return;

  const changed = state.currentId !== id;
  state.currentId = id;

  el.nowArtist.textContent = song.artist;
  el.nowTitle.textContent = song.title;

  const tags = [
    `<span class="now-tag">${escapeHtml(song.category)}</span>`,
    `<span class="now-tag">${escapeHtml(song.genre)}</span>`,
  ];
  if (song.lang === "en") tags.push('<span class="now-tag">English</span>');
  if (song.channel) {
    tags.push(`<span class="now-tag">${escapeHtml(song.channel)}</span>`);
  }
  el.nowTags.innerHTML = tags.join("");

  for (const button of [
    el.btnPlay,
    el.btnRestart,
    el.btnYt,
    el.btnFav,
    el.btnStop,
  ]) {
    button.disabled = false;
  }
  el.btnFav.classList.toggle("on", favorites.has(id));

  if (changed) {
    altIndex = 0;
    blockedVideoId = null;
  }
  setVersionLabel(song);
  renderLyrics(song);
  updatePlayingRows();

  if (changed || options.force) {
    if (options.autoplay) {
      play();
    } else {
      // только выбор: видео ещё не нужно, песню можно спокойно просмотреть
      state.playing = false;
      unloadFrame();
      el.bigPlay.hidden = false;
      el.videoEmpty.hidden = false;
      el.videoBlocked.hidden = true;
      el.videoShell.classList.remove("is-blocked");
      showIdleHint(song);
      syncPlayUi();
    }
  } else if (options.autoplay && !state.playing) {
    // та же песня на паузе — просто продолжаем
    play();
  }

  if (changed) saveLastSong(id);
}

export function play() {
  const song = currentSong();
  if (!song) return;

  if (isBlocked(song)) {
    showBlocked(song);
    return;
  }

  const videoId = activeVideoId(song);

  if (isVideoBlocked(song, videoId)) {
    // не подменяем выбор молча: эта версия живёт только на YouTube
    const alreadyOpen = blockedVideoId === videoId;
    blockedVideoId = videoId;
    if (!alreadyOpen) openOnYouTube(videoId);
    showBlocked(song, videoId, !alreadyOpen);
    return;
  }
  blockedVideoId = null;

  if (loadedId === videoId && !el.frame.hidden) {
    // видео уже загружено — продолжаем, а не начинаем с 0:00
    state.playing = true;
    el.bigPlay.hidden = true;
    sendPlayerCommand(el.frame, "playVideo");
    syncPlayUi();
    return;
  }

  state.playing = true;
  el.bigPlay.hidden = true;
  loadVideo(videoId, true);
  syncPlayUi();
}

export function pause() {
  state.playing = false;
  sendPlayerCommand(el.frame, "pauseVideo");
  syncPlayUi();
}

export function stop() {
  state.playing = false;
  unloadFrame();
  el.videoBlocked.hidden = true;
  el.videoShell.classList.remove("is-blocked");
  el.videoEmpty.hidden = false;
  el.bigPlay.hidden = false;
  const song = currentSong();
  if (song) showIdleHint(song);
  syncPlayUi();
}

export function restart() {
  const song = currentSong();
  if (!song) return;

  if (isBlocked(song)) {
    showBlocked(song);
    return;
  }

  const videoId = currentVideoId();
  if (isVideoBlocked(song, videoId)) {
    showBlocked(song, videoId);
    return;
  }

  if (loadedId === videoId && !el.frame.hidden) {
    sendPlayerCommand(el.frame, "seekTo", [0, true]);
    state.playing = true;
    el.bigPlay.hidden = true;
    syncPlayUi();
    return;
  }

  state.playing = true;
  el.bigPlay.hidden = true;
  loadVideo(videoId, true);
  syncPlayUi();
}

/** Переключение на другую версию караоке, сохраняя состояние воспроизведения. */
export function nextVersion() {
  const song = currentSong();
  if (!song) return;

  const count = versionsOf(song).length;
  if (count < 2) return;

  altIndex = (altIndex + 1) % count;
  blockedVideoId = null;
  setVersionLabel(song);

  const wasPlaying = state.playing;
  loadedId = null;
  el.frame.removeAttribute("src");

  if (wasPlaying) {
    play();
    return;
  }

  state.playing = false;
  el.frame.hidden = true;
  el.videoEmpty.hidden = false;
  el.videoBlocked.hidden = true;
  el.videoShell.classList.remove("is-blocked");
  showIdleHint(song);
  el.bigPlay.hidden = false;
  syncPlayUi();
}

export const openCurrentOnYouTube = () => {
  const videoId = currentVideoId();
  if (videoId) openOnYouTube(videoId);
};
