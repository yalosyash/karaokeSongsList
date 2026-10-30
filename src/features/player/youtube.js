/* Всё, что знает про YouTube: адреса, версии видео и команды плееру.
   Без DOM-состояния приложения — эти функции можно проверить отдельно. */

export const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Все версии караоке-видео для песни: своя + альтернативные. */
export const versionsOf = (song) => [song.id, ...(song.alt || [])];

/** Автор запретил встраивание у всех версий — играть можно только на YouTube. */
export const isBlocked = (song) => !!(song && song.noembed);

/** Запрещена ли конкретная версия (у песни может быть вторая, рабочая). */
export const isVideoBlocked = (song, videoId) =>
  !!(song && Array.isArray(song.blocked) && song.blocked.includes(videoId));

export const watchUrl = (videoId) =>
  `https://www.youtube.com/watch?v=${videoId}`;

export function openOnYouTube(videoId) {
  window.open(watchUrl(videoId), "_blank", "noopener");
}

export function embedUrl(videoId, autoplay) {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    iv_load_policy: "3",
    enablejsapi: "1",
    origin: location.origin,
  });
  return `${YT_ORIGIN}/embed/${videoId}?${params.toString()}`;
}

/** Команда встроенному плееру (пауза/продолжить/перемотка) без перезагрузки. */
export function sendPlayerCommand(frame, func, args = []) {
  try {
    frame.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  } catch {}
}
