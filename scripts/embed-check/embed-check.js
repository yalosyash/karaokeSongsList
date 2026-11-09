/* Прогоняет пачку id через настоящий плеер YouTube и сообщает статус.
   Ключевой признак запрета встраивания — onError со значением 101/150.
   Вызывается из scripts/check-embeds.js. */

window.RESULTS = {};
window.API_READY = false;

const HOST =
  new URLSearchParams(location.search).get("host") ||
  "https://www.youtube-nocookie.com";

const TIMEOUT_MS = 20000;

function onYouTubeIframeAPIReady() {
  window.API_READY = true;
}

/**
 * @param {string[]} ids
 * @returns {Promise<Record<string, {id: string, status: string, error: number|null}>>}
 */
window.checkBatch = function checkBatch(ids) {
  return new Promise((resolve) => {
    const stage = document.getElementById("stage");
    const results = {};
    let left = ids.length;
    if (!left) return resolve(results);

    const done = () => {
      if (--left > 0) return;
      stage.textContent = "";
      Object.assign(window.RESULTS, results);
      resolve(results);
    };

    for (const id of ids) {
      const holder = document.createElement("div");
      holder.className = "cell";
      stage.appendChild(holder);

      const record = { id, status: "pending", error: null };
      results[id] = record;
      let settled = false;

      const settle = (patch) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        Object.assign(record, patch);
        setTimeout(() => {
          try {
            player && player.destroy();
          } catch {}
          holder.remove();
        }, 0);
        done();
      };

      const timer = setTimeout(() => settle({ status: "silent" }), TIMEOUT_MS);

      const player = new YT.Player(holder, {
        videoId: id,
        host: HOST,
        playerVars: {
          autoplay: 1,
          rel: 0,
          playsinline: 1,
          mute: 1,
          origin: location.origin,
        },
        events: {
          onReady: (event) => {
            record.ready = true;
            setTimeout(() => {
              try {
                event.target.mute();
                event.target.playVideo();
              } catch {}
            }, 200);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) settle({ status: "ok" });
            else if (event.data === YT.PlayerState.CUED)
              settle({ status: "cued" });
          },
          onError: (event) => settle({ status: "error", error: event.data }),
        },
      });
    }
  });
};
