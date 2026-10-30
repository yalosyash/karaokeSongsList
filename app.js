/* ============================================================
   Караоке-панель — логика
   Список слева, плеер и первые слова справа.
   ============================================================ */
(() => {
  "use strict";

  const SONGS = window.SONGS || [];
  const byId = new Map(SONGS.map((s) => [s.id, s]));

  const $ = (id) => document.getElementById(id);

  const el = {
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

    frame: $("ytFrame"),
    videoShell: $("videoShell"),
    videoEmpty: $("videoEmpty"),
    videoBlocked: $("videoBlocked"),
    blockedSub: $("blockedSub"),
    openYtBtn: $("openYtBtn"),
    bigPlay: $("bigPlay"),
    emptyTitle: $("emptyTitle"),
    emptySub: $("emptySub"),

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

    lyrics: $("lyricsBody"),
    overlay: $("lyricsOverlay"),
    overlayInner: $("overlayInner"),
    overlayClose: $("overlayClose"),
    fontPlus: $("fontPlus"),
    fontMinus: $("fontMinus"),
    btnFull: $("btnFullLyrics"),
  };

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */
  const state = {
    q: "",
    sort: "artist",
    category: "",
    genre: "",
    lang: "",
    favOnly: false,
    currentId: null,
    playing: false,
    favorites: new Set(),
  };

  const FAV_KEY = "karaoke.favs.v1";
  const SCALE_KEY = "karaoke.scale.v1";

  try {
    const saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    if (Array.isArray(saved))
      saved.forEach((id) => byId.has(id) && state.favorites.add(id));
  } catch {}

  let scale = Number(localStorage.getItem(SCALE_KEY)) || 1;
  const applyScale = () => {
    document.documentElement.style.setProperty("--lyrics-scale", String(scale));
    localStorage.setItem(SCALE_KEY, String(scale));
  };
  applyScale();

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Latin letters that look like Cyrillic ones ("МакSим" -> "максим").
  // Both the data and the query go through this, so typing either alphabet works.
  const LOOKALIKE = {
    a: "а",
    b: "в",
    c: "с",
    e: "е",
    h: "н",
    k: "к",
    m: "м",
    o: "о",
    p: "р",
    t: "т",
    x: "х",
    y: "у",
    s: "с",
    u: "и",
    g: "г",
    l: "л",
    d: "д",
    f: "ф",
    n: "п",
    r: "р",
    v: "в",
    w: "ш",
    z: "з",
    i: "и",
    j: "й",
  };

  function searchNorm(s) {
    return norm(s)
      .split("")
      .map((ch) => LOOKALIKE[ch] || ch)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  const collator = new Intl.Collator("ru", {
    sensitivity: "base",
    numeric: true,
  });
  const sortKey = (s) => norm(s);

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const CATEGORY_ORDER = [
    "Русская поп-музыка",
    "Русский рок",
    "Зарубежная музыка",
    "Детские и мультфильмы",
    "Саундтреки и мюзиклы",
    "Советская эстрада и кино",
    "Военные и народные",
  ];

  const CAT_SHORT = {
    "Русская поп-музыка": "Поп",
    "Русский рок": "Рок",
    "Зарубежная музыка": "Зарубежное",
    "Детские и мультфильмы": "Детское",
    "Саундтреки и мюзиклы": "Саундтреки",
    "Советская эстрада и кино": "Советское",
    "Военные и народные": "Военные",
  };

  /* ---------------------------------------------------------
     plural helper (ru)
     --------------------------------------------------------- */
  function plural(n, one, few, many) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  const songWord = (n) => plural(n, "песня", "песни", "песен");

  /* ---------------------------------------------------------
     building the visible list
     --------------------------------------------------------- */
  function currentList() {
    const q = norm(state.q);
    const qAlt = searchNorm(state.q);

    const matches = (s) => {
      if (!q) return true;
      if (s.search.includes(q) || s.searchAlt.includes(qAlt)) return true;
      // multiple words in any order
      const words = q.split(" ").filter(Boolean);
      return words.every(
        (w) => s.search.includes(w) || s.searchAlt.includes(w),
      );
    };

    let list = SONGS.filter((s) => {
      if (state.favOnly && !state.favorites.has(s.id)) return false;
      if (state.category && s.category !== state.category) return false;
      if (state.genre && s.genre !== state.genre) return false;
      if (state.lang && s.lang !== state.lang) return false;
      return matches(s);
    });

    const cmp = {
      artist: (a, b) =>
        collator.compare(a.artist, b.artist) ||
        collator.compare(a.title, b.title),
      title: (a, b) =>
        collator.compare(a.title, b.title) ||
        collator.compare(a.artist, b.artist),
      genre: (a, b) => collator.compare(a.genre, b.genre) || cmpArtist(a, b),
      category: (a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category);
        const ib = CATEGORY_ORDER.indexOf(b.category);
        return ia - ib || cmpArtist(a, b);
      },
    };
    const cmpArtist = (a, b) =>
      collator.compare(a.artist, b.artist) ||
      collator.compare(a.title, b.title);

    return list.sort(cmp[state.sort] || cmp.artist);
  }

  /* ---------------------------------------------------------
     render list
     --------------------------------------------------------- */
  function rowHtml(s, groupBy) {
    const active = s.id === state.currentId;
    const fav = state.favorites.has(s.id);
    return (
      `<div class="row${active ? " active" : ""}${active && state.playing ? " playing" : ""}" role="option"` +
      ` aria-selected="${active}" data-id="${s.id}" tabindex="-1" draggable="false">` +
      `<span class="row-artist">${escapeHtml(s.artist)}</span>` +
      `<span class="row-title">${escapeHtml(s.title)}</span>` +
      `<span class="row-meta">` +
      `<span class="row-badge">${escapeHtml(CAT_SHORT[s.category] || s.category)}</span>` +
      (groupBy !== "genre"
        ? `<span class="row-badge">${escapeHtml(s.genre)}</span>`
        : "") +
      (s.lang === "en" ? `<span class="row-badge">EN</span>` : "") +
      `</span>` +
      `<span class="row-side">` +
      (s.noembed
        ? `<span class="row-ext" title="Играет только на YouTube" aria-label="Играет только на YouTube">↗</span>`
        : "") +
      `<button class="row-fav${fav ? " on" : ""}" data-fav="${s.id}" title="В избранное" aria-label="В избранное">` +
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8L12 3.5Z"/></svg>` +
      `</button>` +
      `<span class="row-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.4-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z"/></svg></span>` +
      `</span>` +
      `</div>`
    );
  }

  function render() {
    const list = currentList();

    // group headers only when the sort makes them meaningful
    let html = "";
    const groupKey =
      state.sort === "artist"
        ? (s) =>
            s.artist
              .replace(/^(the|a|an|группа)\s+/i, "")
              .charAt(0)
              .toUpperCase()
        : state.sort === "title"
          ? (s) => s.title.charAt(0).toUpperCase()
          : null;

    if (groupKey) {
      let last = null;
      for (const s of list) {
        const key = groupKey(s);
        if (key !== last) {
          html += `<div class="group-head">${escapeHtml(key)}</div>`;
          last = key;
        }
        html += rowHtml(s, state.sort);
      }
    } else {
      let last = null;
      for (const s of list) {
        const key = state.sort === "genre" ? s.genre : s.category;
        if (key !== last) {
          html += `<div class="group-head">${escapeHtml(key)}</div>`;
          last = key;
        }
        html += rowHtml(s, state.sort);
      }
    }

    el.list.innerHTML = html;
    el.empty.hidden = list.length > 0;
    el.list.hidden = list.length === 0;

    el.resultCount.textContent =
      list.length === SONGS.length
        ? `Все песни · ${list.length}`
        : `Найдено ${list.length} ${songWord(list.length)} из ${SONGS.length}`;

    const filtered = !!(
      state.q ||
      state.category ||
      state.genre ||
      state.lang ||
      state.favOnly
    );
    el.reset.hidden = !filtered;
  }

  /* ---------------------------------------------------------
     chips + selects
     --------------------------------------------------------- */
  function renderChips() {
    const counts = new Map();
    SONGS.forEach((s) =>
      counts.set(s.category, (counts.get(s.category) || 0) + 1),
    );

    let html =
      `<button class="chip chip-fav" data-fav-filter="1" aria-selected="${state.favOnly}" title="Только избранные (S)">` +
      `★ Избранное${state.favorites.size ? `<span class="chip-n">${state.favorites.size}</span>` : ""}</button>`;
    html += `<button class="chip" data-cat="" aria-selected="${!state.category && !state.favOnly}">Все<span class="chip-n">${SONGS.length}</span></button>`;
    for (const cat of CATEGORY_ORDER) {
      const n = counts.get(cat);
      if (!n) continue;
      html +=
        `<button class="chip" data-cat="${escapeHtml(cat)}" aria-selected="${state.category === cat}">` +
        `${escapeHtml(CAT_SHORT[cat] || cat)}<span class="chip-n">${n}</span></button>`;
    }
    el.chips.innerHTML = html;

    // make the selected chip visible when the row overflows
    const sel = el.chips.querySelector('.chip[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  function renderGenreOptions() {
    const genres = [...new Set(SONGS.map((s) => s.genre))].sort(
      collator.compare,
    );
    el.genre.innerHTML =
      '<option value="">Все жанры</option>' +
      genres
        .map(
          (g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`,
        )
        .join("");
  }

  /* ---------------------------------------------------------
     selection / player
     --------------------------------------------------------- */
  const YT_ORIGIN = "https://www.youtube-nocookie.com";
  let loadedId = null; // which video the iframe currently holds
  let altIndex = 0; // which link variant is active for the current song

  // the song's own video plus any alternate versions
  const versionsOf = (song) => [song.id, ...(song.alt || [])];
  const activeVideoId = (song) => versionsOf(song)[altIndex] || song.id;

  // the owner disabled embedding for every video of this song -> YouTube only
  const isBlocked = (song) => !!(song && song.noembed);
  // a specific version may be blocked while another one still embeds
  const videoBlocked = (song, vid) =>
    !!(song && Array.isArray(song.blocked) && song.blocked.includes(vid));

  function watchUrl(vid) {
    return `https://www.youtube.com/watch?v=${vid}`;
  }

  function openOnYouTube(vid) {
    window.open(watchUrl(vid), "_blank", "noopener");
  }

  function frameUrl(id, autoplay) {
    const p = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      iv_load_policy: "3",
      enablejsapi: "1",
      origin: location.origin,
    });
    return `${YT_ORIGIN}/embed/${id}?${p.toString()}`;
  }

  // talk to the YouTube player (pause/resume/restart without reloading the frame)
  function ytCommand(func, args = []) {
    const frame = el.frame;
    try {
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "*",
      );
    } catch {}
  }

  function loadSong(id, autoplay) {
    loadedId = id;
    el.videoEmpty.hidden = true;
    el.videoBlocked.hidden = true;
    el.videoShell.classList.remove("is-blocked");
    el.frame.hidden = false;
    el.frame.src = frameUrl(id, autoplay);
  }

  // take the video out of the page: no playback, no hidden sound in the background
  function unloadFrame() {
    ytCommand("stopVideo");
    loadedId = null;
    el.frame.hidden = true;
    el.frame.removeAttribute("src");
  }

  // the owner disabled embedding: show an honest message instead of a black box
  function showBlocked(song) {
    loadedId = null;
    state.playing = false;
    el.frame.hidden = true;
    el.frame.removeAttribute("src");
    el.videoEmpty.hidden = true;
    el.bigPlay.hidden = true;
    el.videoBlocked.hidden = false;
    el.videoShell.classList.add("is-blocked");
    if (el.blockedSub && song) {
      el.blockedSub.textContent =
        "Автор видео запретил встраивание — здесь оно не проиграется. Откроем на YouTube.";
    }
    syncPlayUi();
  }

  function currentVideoId() {
    const song = byId.get(state.currentId);
    return song ? activeVideoId(song) : null;
  }

  function select(id, opts = {}) {
    const song = byId.get(id);
    if (!song) return;

    const changed = state.currentId !== id;
    state.currentId = id;

    el.nowArtist.textContent = song.artist;
    el.nowTitle.textContent = song.title;

    const tags = [];
    tags.push(`<span class="now-tag">${escapeHtml(song.category)}</span>`);
    tags.push(`<span class="now-tag">${escapeHtml(song.genre)}</span>`);
    if (song.lang === "en") tags.push('<span class="now-tag">English</span>');
    if (song.channel)
      tags.push(`<span class="now-tag">${escapeHtml(song.channel)}</span>`);
    el.nowTags.innerHTML = tags.join("");

    el.btnPlay.disabled = false;
    el.btnRestart.disabled = false;
    el.btnYt.disabled = false;
    el.btnFav.disabled = false;
    el.btnStop.disabled = false;

    el.btnFav.classList.toggle("on", state.favorites.has(id));

    // alternate-version button (only when the song has a second karaoke video)
    if (changed) altIndex = 0;
    const versions = versionsOf(song);
    el.btnAlt.hidden = versions.length < 2;
    if (versions.length > 1)
      el.altLabel.textContent = `Версия ${altIndex + 1}/${versions.length}`;

    renderLyrics(song);

    // highlight in list
    document.querySelectorAll(".row").forEach((r) => {
      const on = r.dataset.id === id;
      r.classList.toggle("active", on);
      r.setAttribute("aria-selected", String(on));
      r.classList.toggle("playing", on && state.playing);
    });

    if (changed || opts.force) {
      if (opts.autoplay) {
        play();
      } else {
        // selection only: no video until the user asks for it, so the song can
        // be checked out (title, tags, first lines) before anything starts playing
        state.playing = false;
        unloadFrame();
        el.bigPlay.hidden = false;
        el.videoEmpty.hidden = false;
        el.videoBlocked.hidden = true;
        el.videoShell.classList.remove("is-blocked");
        el.emptyTitle.textContent = song.title;
        el.emptySub.textContent = isBlocked(song)
          ? "Это видео играет только на YouTube — Enter откроет его"
          : "Нажмите ▶ — и начнём петь";
        syncPlayUi();
      }
    } else if (opts.autoplay && !state.playing) {
      // same song, currently paused -> just resume
      play();
    }
  }

  function play() {
    const song = byId.get(state.currentId);
    if (!song) return;

    // embedding disabled by the video owner: the frame would only show an error
    if (isBlocked(song)) {
      showBlocked(song);
      return;
    }

    const vid = activeVideoId(song);

    // this particular version is blocked but the song has another one
    if (videoBlocked(song, vid)) {
      const free = versionsOf(song).findIndex((v) => !videoBlocked(song, v));
      if (free > -1 && free !== altIndex) {
        altIndex = free;
        el.altLabel.textContent = `Версия ${altIndex + 1}/${versionsOf(song).length}`;
        play();
        return;
      }
      showBlocked(song);
      return;
    }

    if (loadedId === vid && !el.frame.hidden) {
      // already loaded - just resume instead of reloading from 0:00
      state.playing = true;
      el.bigPlay.hidden = true;
      ytCommand("playVideo");
      syncPlayUi();
      return;
    }

    state.playing = true;
    el.bigPlay.hidden = true;
    loadSong(vid, true);
    syncPlayUi();
  }

  function pause() {
    state.playing = false;
    ytCommand("pauseVideo");
    syncPlayUi();
  }

  function markPlaying() {
    document.querySelectorAll(".row").forEach((r) => {
      r.classList.toggle(
        "playing",
        r.dataset.id === state.currentId && state.playing,
      );
    });
  }

  function syncPlayUi() {
    el.btnPlay.classList.toggle("is-playing", state.playing);
    el.btnPlayLabel.textContent = state.playing ? "Пауза" : "Петь";
    markPlaying();
  }

  function stop() {
    state.playing = false;
    unloadFrame();
    el.videoBlocked.hidden = true;
    el.videoShell.classList.remove("is-blocked");
    el.videoEmpty.hidden = false;
    el.bigPlay.hidden = false;
    const song = byId.get(state.currentId);
    if (song) {
      el.emptyTitle.textContent = song.title;
      el.emptySub.textContent = isBlocked(song)
        ? "Это видео играет только на YouTube — Enter откроет его"
        : "Нажмите ▶ — и начнём петь";
    }
    syncPlayUi();
  }

  function restart() {
    if (!state.currentId) return;
    const song = byId.get(state.currentId);
    const vid = currentVideoId();
    if (isBlocked(song)) {
      showBlocked(song);
      return;
    }
    if (loadedId === vid && !el.frame.hidden) {
      ytCommand("seekTo", [0, true]);
      state.playing = true;
      el.bigPlay.hidden = true;
      syncPlayUi();
      return;
    }
    state.playing = true;
    el.bigPlay.hidden = true;
    loadSong(vid, true);
    syncPlayUi();
  }

  /* ---------------------------------------------------------
     lyrics
     --------------------------------------------------------- */
  function lyricsBlock(label, cls, lines) {
    if (!lines || !lines.length) return "";
    return (
      `<div class="lyr-block">` +
      `<div class="lyr-label ${cls}">${label}</div>` +
      lines.map((l) => `<p class="lyr-line">${escapeHtml(l)}</p>`).join("") +
      `</div>`
    );
  }

  function renderLyrics(song) {
    let verse = song.verse;
    let chorus = song.chorus;

    if (!verse && !chorus) {
      const html =
        `<div class="lyr-none">Текст этой песни не нашёлся в базе.<br>` +
        `<b>Не страшно:</b> нажмите ▶ — в самом караоке слова бегут по экрану.</div>`;
      el.lyrics.innerHTML = html;
      el.overlayInner.innerHTML =
        `<div class="ov-head">${escapeHtml(song.artist)} — ${escapeHtml(song.title)}</div>` +
        html;
      return;
    }

    // only a chorus is known — show it rather than nothing
    const parts = [];
    if (verse) parts.push(lyricsBlock("Куплет", "", verse));
    else
      parts.push(
        `<div class="lyr-block"><div class="lyr-label">Куплет</div>` +
          `<p class="lyr-line lyr-na">Текст куплета не нашёлся — но припев ниже подскажет мотив.</p></div>`,
      );
    if (chorus) parts.push(lyricsBlock("Припев", "ch", chorus));

    const html = parts.join("");

    el.lyrics.innerHTML = html;
    el.overlayInner.innerHTML =
      `<div class="ov-head">${escapeHtml(song.artist)} — ${escapeHtml(song.title)}</div>` +
      html;
    el.overlayInner.scrollTop = 0;
  }

  /* ---------------------------------------------------------
     favorites
     --------------------------------------------------------- */
  function toggleFav(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites]));
    } catch {}

    // update every button for this song
    document
      .querySelectorAll(`.row-fav[data-fav="${CSS.escape(id)}"]`)
      .forEach((b) => {
        b.classList.toggle("on", state.favorites.has(id));
      });
    if (state.currentId === id)
      el.btnFav.classList.toggle("on", state.favorites.has(id));

    // the favourites chip shows a live count / the list may filter on it
    renderChips();
    if (state.favOnly) render();
  }

  /* ---------------------------------------------------------
     actions
     --------------------------------------------------------- */
  function pickRandom() {
    const list = currentList();
    if (!list.length) return;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && pick.id === state.currentId) {
      pick = list[(list.indexOf(pick) + 1) % list.length];
    }
    select(pick.id, { autoplay: true });
    scrollToRow(pick.id);
  }

  function scrollToRow(id) {
    const row = el.list.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearFilters() {
    state.q = "";
    state.category = "";
    state.genre = "";
    state.lang = "";
    state.favOnly = false;
    el.search.value = "";
    el.genre.value = "";
    el.lang.value = "";
    el.searchClear.hidden = true;
    renderChips();
    render();
  }

  function setScale(next) {
    scale = Math.min(2, Math.max(0.7, Math.round(next * 10) / 10));
    applyScale();
  }

  function toggleOverlay(force) {
    const show = force !== undefined ? force : el.overlay.hidden;
    el.overlay.hidden = !show;
    if (show && state.currentId) el.overlayInner.scrollTop = 0;
  }

  /* ---------------------------------------------------------
     events
     --------------------------------------------------------- */
  el.search.addEventListener("input", () => {
    state.q = el.search.value;
    el.searchClear.hidden = !state.q;
    render();
  });

  el.searchClear.addEventListener("click", () => {
    el.search.value = "";
    state.q = "";
    el.searchClear.hidden = true;
    render();
    el.search.focus();
  });

  el.sort.addEventListener("change", () => {
    state.sort = el.sort.value;
    render();
  });

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (chip.dataset.favFilter) {
      state.favOnly = !state.favOnly;
      state.category = "";
      renderChips();
      render();
      return;
    }
    const cat = chip.dataset.cat || "";
    state.category = state.category === cat ? "" : cat;
    state.favOnly = false;
    renderChips();
    render();
  });

  el.genre.addEventListener("change", () => {
    state.genre = el.genre.value;
    render();
  });

  el.lang.addEventListener("change", () => {
    state.lang = el.lang.value;
    render();
  });

  el.reset.addEventListener("click", clearFilters);
  el.reset2.addEventListener("click", clearFilters);
  el.random.addEventListener("click", pickRandom);

  el.list.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".row-fav");
    if (favBtn) {
      e.stopPropagation();
      toggleFav(favBtn.dataset.fav);
      return;
    }
    const row = e.target.closest(".row");
    if (!row) return;
    // one click = select only (no video yet), so the song can be reviewed first;
    // a double click starts the karaoke, and clicking the playing song pauses it
    if (row.dataset.id === state.currentId && state.playing) {
      pause();
      return;
    }
    select(row.dataset.id);
    try {
      localStorage.setItem("karaoke.last.v1", row.dataset.id);
    } catch {}
  });

  el.list.addEventListener("dblclick", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    select(row.dataset.id, { autoplay: true, force: true });
  });

  el.bigPlay.addEventListener("click", play);

  el.btnPlay.addEventListener("click", () => {
    if (!state.currentId) return;
    if (state.playing) pause();
    else play();
  });

  el.btnRestart.addEventListener("click", restart);

  el.btnYt.addEventListener("click", () => {
    const vid = currentVideoId();
    if (!vid) return;
    openOnYouTube(vid);
  });

  el.openYtBtn.addEventListener("click", () => {
    const vid = currentVideoId();
    if (vid) openOnYouTube(vid);
  });

  el.btnAlt.addEventListener("click", () => {
    const song = byId.get(state.currentId);
    if (!song) return;
    const n = versionsOf(song).length;
    if (n < 2) return;
    altIndex = (altIndex + 1) % n;
    el.altLabel.textContent = `Версия ${altIndex + 1}/${n}`;
    // switch version keeping the play state
    const wasPlaying = state.playing;
    loadedId = null;
    el.frame.removeAttribute("src");
    if (wasPlaying) play();
    else {
      state.playing = false;
      el.frame.hidden = true;
      el.videoEmpty.hidden = false;
      el.videoBlocked.hidden = true;
      el.videoShell.classList.remove("is-blocked");
      el.emptyTitle.textContent = song.title;
      el.emptySub.textContent = `Версия ${altIndex + 1} — нажмите ▶`;
      el.bigPlay.hidden = false;
      syncPlayUi();
    }
  });

  el.btnFav.addEventListener("click", () => {
    if (state.currentId) toggleFav(state.currentId);
  });

  el.btnStop.addEventListener("click", stop);
  el.overlayClose.addEventListener("click", () => toggleOverlay(false));
  el.overlay.addEventListener("click", (e) => {
    if (e.target === el.overlay) toggleOverlay(false);
  });
  el.fontPlus.addEventListener("click", () => setScale(scale + 0.1));
  el.fontMinus.addEventListener("click", () => setScale(scale - 0.1));
  el.btnFull.addEventListener("click", () => toggleOverlay());

  /* ---------------------------------------------------------
     keyboard
     --------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName || "");

    /* ---- typing in the search box ---- */
    if (inField && active === el.search) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // jump from the search field straight into the song list
        e.preventDefault();
        const rows = [...el.list.querySelectorAll(".row")];
        if (!rows.length) return;
        const cur = rows.findIndex((r) => r.dataset.id === state.currentId);
        const next =
          cur === -1
            ? e.key === "ArrowDown"
              ? 0
              : rows.length - 1
            : Math.min(
                rows.length - 1,
                Math.max(0, cur + (e.key === "ArrowDown" ? 1 : -1)),
              );
        el.search.blur();
        select(rows[next].dataset.id);
        scrollToRow(rows[next].dataset.id);
        rows[next].focus({ preventScroll: true });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const rows = [...el.list.querySelectorAll(".row")];
        const pick =
          rows.find((r) => r.dataset.id === state.currentId) || rows[0];
        if (pick) {
          el.search.blur();
          select(pick.dataset.id);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        el.search.blur();
        return;
      }
      return; // let the user type
    }

    if (e.key === "/" && !inField) {
      e.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }

    if (e.key === "Escape") {
      if (!el.overlay.hidden) {
        toggleOverlay(false);
        return;
      }
      if (inField) {
        active.blur();
        return;
      }
      stop();
      return;
    }

    if (inField) return;

    const rows = [...el.list.querySelectorAll(".row")];
    const idx = rows.findIndex((r) => r.dataset.id === state.currentId);

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const next =
        idx === -1
          ? e.key === "ArrowDown"
            ? 0
            : rows.length - 1
          : Math.min(
              rows.length - 1,
              Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)),
            );
      select(rows[next].dataset.id);
      scrollToRow(rows[next].dataset.id);
      rows[next].focus({ preventScroll: true });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (state.currentId) play();
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      if (!state.currentId) return;
      el.btnPlay.click();
      return;
    }

    const k = e.key.toLowerCase();
    if (k === "s") {
      if (state.currentId) toggleFav(state.currentId);
      return;
    }
    if (k === "f") {
      toggleOverlay();
      return;
    }
    if (k === "r") {
      pickRandom();
      return;
    }
    if (k === "y") {
      el.btnYt.click();
      return;
    }
    if (k === "0") {
      restart();
      return;
    }
  });

  /* ---------------------------------------------------------
     init
     --------------------------------------------------------- */
  el.total.textContent = `${SONGS.length} ${songWord(SONGS.length)}`;
  renderGenreOptions();
  renderChips();
  render();

  // restore last song
  let lastId = null;
  try {
    lastId = localStorage.getItem("karaoke.last.v1");
  } catch {}
  if (lastId && byId.has(lastId)) {
    select(lastId);
    scrollToRow(lastId);
  }
})();
