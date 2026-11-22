/* Управление плеером: выбор песни, запуск, пауза, стоп, перезапуск, версии. */

import { state } from "../../core/state.js";
import { saveLastSong } from "../../core/storage.js";
import { el } from "../../core/dom.js";
import { escapeHtml } from "../../core/text.js";
import { byId } from "../../catalog/catalog.js";
import { renderLyrics } from "../lyrics.js";
import { updatePlayingRows } from "../list.js";
import {
  embedUrl,
  isBlocked,
  isVideoBlocked,
  openOnYouTube,
  sendPlayerCommand,
  versionsOf,
} from "./youtube.js";

/* Какое видео сейчас лежит в iframe и какая версия выбрана для песни. */
let loadedId = null;
let altIndex = 0;

const currentSong = () => byId.get(state.currentId);
const activeVideoId = (song) => versionsOf(song)[altIndex] || song.id;
const currentVideoId = () => {
  const song = currentSong();
  return song ? activeVideoId(song) : null;
};

const playsOnlyOnYouTube = (song, videoId) =>
  isBlocked(song) || isVideoBlocked(song, videoId);

function setVersionLabel(song) {
  const versions = versionsOf(song);
  el.btnAlt.hidden = versions.length < 2;
  if (versions.length > 1) {
    el.altLabel.textContent = `Версия ${altIndex + 1}/${versions.length}`;
    el.btnAlt.dataset.tooltip = playsOnlyOnYouTube(song, versions[altIndex])
      ? "Эта версия играет только на YouTube — переключить на другую"
      : "Другая версия караоке";
  }
}

function syncPlayUi() {
  const youtubeOnly = !el.videoBlocked.hidden;
  for (const button of [el.btnPlay, el.btnRestart, el.btnStop]) {
    button.hidden = youtubeOnly;
  }
  el.btnPlay.classList.toggle("is-playing", state.playing);
  el.btnPlayLabel.textContent = state.playing ? "Пауза" : "Петь";
  updatePlayingRows();
}

function loadVideo(videoId, autoplay) {
  loadedId = videoId;
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

function showBlocked(song, videoId) {
  state.playing = false;
  unloadFrame();
  el.videoEmpty.hidden = true;
  el.bigPlay.hidden = true;
  el.videoBlocked.hidden = false;
  el.videoShell.classList.add("is-blocked");
  const versions = versionsOf(song);
  const hasOther = versions.some((id) => !playsOnlyOnYouTube(song, id));
  el.blockedSub.textContent = hasOther
    ? `Версия ${versions.indexOf(videoId) + 1}/${versions.length} доступна только на YouTube. Можно выбрать другую версию.`
    : "Автор видео запретил встраивание.";
  el.blockedAltBtn.hidden = !hasOther;
  syncPlayUi();
}

function showIdle(song) {
  const videoId = activeVideoId(song);
  if (playsOnlyOnYouTube(song, videoId)) {
    showBlocked(song, videoId);
    return;
  }
  state.playing = false;
  unloadFrame();
  el.videoBlocked.hidden = true;
  el.videoShell.classList.remove("is-blocked");
  el.videoEmpty.hidden = false;
  el.bigPlay.hidden = false;
  el.emptyTitle.textContent = song.title;
  el.emptySub.textContent = "Нажмите ▶ — и начнём петь";
  syncPlayUi();
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
  el.nowTags.innerHTML = tags.join("");

  for (const button of [el.btnPlay, el.btnRestart, el.btnYt, el.btnStop]) {
    button.disabled = false;
  }

  if (changed) altIndex = 0;
  setVersionLabel(song);
  renderLyrics(song);
  updatePlayingRows();

  if (changed || options.force) {
    if (options.autoplay) {
      play();
    } else {
      showIdle(song);
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

  const videoId = activeVideoId(song);
  if (playsOnlyOnYouTube(song, videoId)) {
    showBlocked(song, videoId);
    return;
  }

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
  const song = currentSong();
  if (song) showIdle(song);
}

export function restart() {
  const song = currentSong();
  if (!song) return;

  const videoId = activeVideoId(song);
  if (playsOnlyOnYouTube(song, videoId)) {
    showBlocked(song, videoId);
    return;
  }

  if (loadedId === videoId && !el.frame.hidden) {
    sendPlayerCommand(el.frame, "seekTo", [0, true]);
    if (state.playing) return;
  }

  play();
}

/** Переключение на другую версию караоке, сохраняя состояние воспроизведения. */
export function nextVersion() {
  const song = currentSong();
  if (!song) return;

  const count = versionsOf(song).length;
  if (count < 2) return;

  altIndex = (altIndex + 1) % count;
  setVersionLabel(song);

  if (state.playing) {
    play();
  } else {
    showIdle(song);
  }
}

export const openCurrentOnYouTube = () => {
  const videoId = currentVideoId();
  if (videoId) openOnYouTube(videoId);
};
