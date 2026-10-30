/* Текст песни в панели и на весь экран, плюс размер шрифта. */

import { escapeHtml } from "../core/text.js";
import { el } from "../core/dom.js";
import { ui } from "../core/state.js";
import { changeLyricScale } from "../core/settings.js";

function blockHtml(label, className, lines) {
  if (!lines || !lines.length) return "";
  return (
    `<div class="lyr-block">` +
    `<div class="lyr-label ${className}">${label}</div>` +
    lines
      .map((line) => `<p class="lyr-line">${escapeHtml(line)}</p>`)
      .join("") +
    `</div>`
  );
}

const NO_LYRICS =
  `<div class="lyr-none">Текст этой песни не нашёлся в базе.<br>` +
  `<b>Не страшно:</b> нажмите ▶ — в самом караоке слова бегут по экрану.</div>`;

function headerHtml(song) {
  return `<div class="ov-head">${escapeHtml(song.artist)} — ${escapeHtml(song.title)}</div>`;
}

export function renderLyrics(song) {
  const { verse, chorus } = song;

  if (!verse && !chorus) {
    el.lyrics.innerHTML = NO_LYRICS;
    el.overlayInner.innerHTML = headerHtml(song) + NO_LYRICS;
    return;
  }

  const parts = [];
  if (verse) {
    parts.push(blockHtml("Куплет", "", verse));
  } else {
    // известен только припев — честно говорим об этом вместо пустого блока
    parts.push(
      `<div class="lyr-block"><div class="lyr-label">Куплет</div>` +
        `<p class="lyr-line lyr-na">Текст куплета не нашёлся — но припев ниже подскажет мотив.</p></div>`,
    );
  }
  if (chorus) parts.push(blockHtml("Припев", "ch", chorus));

  const html = parts.join("");
  el.lyrics.innerHTML = html;
  el.overlayInner.innerHTML = headerHtml(song) + html;
  el.overlayInner.scrollTop = 0;
}

export function toggleOverlay(force) {
  const show = force !== undefined ? force : el.overlay.hidden;
  el.overlay.hidden = !show;
  ui.overlayOpen = show;
  if (show) el.overlayInner.scrollTop = 0;
}

export function wireLyricsControls() {
  el.overlayClose.addEventListener("click", () => toggleOverlay(false));
  el.overlay.addEventListener("click", (event) => {
    if (event.target === el.overlay) toggleOverlay(false);
  });
  el.btnFull.addEventListener("click", () => toggleOverlay());
  el.fontPlus.addEventListener("click", () => changeLyricScale(0.1));
  el.fontMinus.addEventListener("click", () => changeLyricScale(-0.1));
}
