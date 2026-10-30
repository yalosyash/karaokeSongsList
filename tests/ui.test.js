/**
 * Сквозной тест интерфейса: поднимает настоящую страницу в jsdom и кликает по ней.
 * Запуск:  npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost:4173/',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.HTMLElement.prototype.scrollIntoView = function () {};
    win.CSS = win.CSS || {};
    win.CSS.escape = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
    win.localStorage.clear();
  },
});

const win = dom.window;
const doc = win.document;
const errors = [];
win.addEventListener('error', (e) => errors.push('window error: ' + e.message));

function waitFor(pred, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (pred()) return resolve(true);
      if (Date.now() - t0 > timeout) return reject(new Error('timeout waiting for condition'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

const click = (node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const key = (k) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));

const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra: String(extra) });

(async () => {
  await waitFor(() => win.SONGS && doc.querySelectorAll('.row').length > 0);
  const N = win.SONGS.length;

  /* ---------- каталог ---------- */
  check('каталог загружен', N > 150, N);
  check('все песни в списке', doc.querySelectorAll('.row').length === N, doc.querySelectorAll('.row').length);

  const row = doc.querySelector('.row');
  check('исполнитель сверху, название снизу',
    !!row.querySelector('.row-artist') &&
    !!row.querySelector('.row-title') &&
    row.querySelector('.row-artist').compareDocumentPosition(row.querySelector('.row-title')) &
      win.Node.DOCUMENT_POSITION_FOLLOWING);

  const arts = [...doc.querySelectorAll('.row-artist')].map((n) => n.textContent);
  const sorted = [...arts].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
  check('сортировка по исполнителю', JSON.stringify(arts) === JSON.stringify(sorted));

  /* ---------- выбор без запуска видео ---------- */
  const target = [...doc.querySelectorAll('.row')].find((r) => r.dataset.id === 'AJFHUiFof9M');
  click(target);
  await waitFor(() => doc.getElementById('nowTitle').textContent === 'Знаешь ли ты');

  check('песня выбрана', doc.getElementById('nowTitle').textContent === 'Знаешь ли ты');
  check('исполнитель показан', doc.getElementById('nowArtist').textContent === 'МакSим');
  check('строка подсвечена', doc.querySelector('.row.active')?.dataset.id === 'AJFHUiFof9M');

  const frame = doc.getElementById('ytFrame');
  check('клик по песне не запускает видео',
    frame.hidden === true && !frame.getAttribute('src'), frame.src);
  check('кнопка осталась «Петь»', doc.getElementById('btnPlayLabel').textContent === 'Петь');
  check('подсказка предлагает запуск',
    /Нажмите ▶/.test(doc.getElementById('emptySub').textContent));
  check('выбор песни запоминается', win.localStorage.getItem('karaoke.last.v1') === 'AJFHUiFof9M');

  /* ---------- запуск по явному действию ---------- */
  key('Enter');
  await waitFor(() => !doc.getElementById('ytFrame').hidden);
  check('плеер открылся на странице', frame.hidden === false && frame.src.includes('AJFHUiFof9M'), frame.src);
  check('автозапуск включён', frame.src.includes('autoplay=1'));
  check('кнопка стала «Пауза»', doc.getElementById('btnPlayLabel').textContent === 'Пауза');

  /* ---------- текст ---------- */
  const lyr = doc.getElementById('lyricsBody');
  check('куплет показан', /Куплет/.test(lyr.textContent));
  check('припев показан', /Припев/.test(lyr.textContent));
  check('верный текст куплета', /Я так привыкла жить одним тобой/.test(lyr.textContent));
  check('верный текст припева', /Вдоль ночных дорог/.test(lyr.textContent));

  /* ---------- поиск ---------- */
  const search = doc.getElementById('search');
  search.value = 'максим';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('поиск находит МакSим (латиница/кириллица)', doc.querySelectorAll('.row').length === 9, doc.querySelectorAll('.row').length);

  search.value = 'земфира';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('поиск по исполнителю', doc.querySelectorAll('.row').length === 5, doc.querySelectorAll('.row').length);

  search.value = 'батарейка';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('поиск по названию', doc.querySelectorAll('.row').length === 1, doc.querySelectorAll('.row').length);

  search.value = 'рок';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('поиск по жанру', doc.querySelectorAll('.row').length > 20, doc.querySelectorAll('.row').length);

  click(doc.getElementById('searchClear'));
  check('очистка поиска', doc.querySelectorAll('.row').length === N);

  /* ---------- фильтры ---------- */
  const rockChip = [...doc.querySelectorAll('.chip')].find((c) => c.dataset.cat === 'Русский рок');
  click(rockChip);
  const rockN = doc.querySelectorAll('.row').length;
  check('фильтр по категории', rockN === 30, rockN);
  check('чип выбран', doc.querySelector('.chip[data-cat="Русский рок"]').getAttribute('aria-selected') === 'true');

  click(doc.querySelector('.chip[data-cat="Русский рок"]'));
  check('повторный клик снимает фильтр', doc.querySelectorAll('.row').length === N);

  const genre = doc.getElementById('genreFilter');
  genre.value = 'Хард-рок';
  genre.dispatchEvent(new win.Event('change', { bubbles: true }));
  check('фильтр по жанру', doc.querySelectorAll('.row').length === 2, doc.querySelectorAll('.row').length);

  const lang = doc.getElementById('langFilter');
  lang.value = 'en';
  lang.dispatchEvent(new win.Event('change', { bubbles: true }));
  check('фильтр по языку', doc.querySelectorAll('.row').length === 0);

  click(doc.getElementById('resetFilters'));
  check('сброс фильтров', doc.querySelectorAll('.row').length === N);

  /* ---------- сортировки ---------- */
  const sort = doc.getElementById('sort');
  for (const [mode, label] of [['title', 'названию'], ['genre', 'жанру'], ['category', 'категории']]) {
    sort.value = mode;
    sort.dispatchEvent(new win.Event('change', { bubbles: true }));
    check(`сортировка по ${label}`, doc.querySelectorAll('.group-head').length > 3, doc.querySelectorAll('.group-head').length);
  }
  sort.value = 'artist';
  sort.dispatchEvent(new win.Event('change', { bubbles: true }));

  /* ---------- избранное ---------- */
  click(doc.getElementById('btnFav'));
  check('добавлено в избранное', doc.getElementById('btnFav').classList.contains('on'));
  check('избранное сохраняется', JSON.parse(win.localStorage.getItem('karaoke.favs.v1') || '[]').includes('AJFHUiFof9M'));

  click(doc.querySelector('.chip-fav'));
  check('показ только избранного', doc.querySelectorAll('.row').length === 1, doc.querySelectorAll('.row').length);
  click(doc.querySelector('.chip-fav'));
  check('выход из избранного', doc.querySelectorAll('.row').length === N);

  /* ---------- большой текст ---------- */
  click(doc.getElementById('btnFullLyrics'));
  check('текст на весь экран', doc.getElementById('lyricsOverlay').hidden === false);
  check('в оверлее есть слова', /Знаешь ли ты/.test(doc.getElementById('overlayInner').textContent));
  click(doc.getElementById('overlayClose'));
  check('оверлей закрылся', doc.getElementById('lyricsOverlay').hidden === true);

  const before = win.getComputedStyle(doc.documentElement).getPropertyValue('--lyrics-scale').trim();
  click(doc.getElementById('fontPlus'));
  const after = win.getComputedStyle(doc.documentElement).getPropertyValue('--lyrics-scale').trim();
  check('размер текста меняется', before !== after, `${before} → ${after}`);

  /* ---------- клавиатура ---------- */
  const prev = doc.querySelector('.row.active')?.dataset.id;
  key('ArrowDown');
  check('стрелка вниз переключает песню', doc.querySelector('.row.active')?.dataset.id !== prev);
  check('стрелка не запускает видео',
    doc.getElementById('ytFrame').hidden === true && !doc.getElementById('ytFrame').getAttribute('src'));

  key('/');
  check('слэш фокусирует поиск', doc.activeElement === doc.getElementById('search'));

  doc.activeElement.blur();
  key('Escape');
  check('Esc останавливает', doc.getElementById('ytFrame').hidden === true);
  check('кнопка снова «Петь»', doc.getElementById('btnPlayLabel').textContent === 'Петь');

  /* ---------- каждая песня открывается ---------- */
  let broken = 0;
  for (const s of win.SONGS) {
    const r = [...doc.querySelectorAll('.row')].find((x) => x.dataset.id === s.id);
    if (!r) { broken++; continue; }
    click(r);
    if (!doc.getElementById('lyricsBody').textContent.trim()) broken++;
    if (doc.getElementById('nowTitle').textContent !== s.title) broken++;
  }
  check('все песни открываются и показывают текст', broken === 0, broken);

  /* ---------- видео без встраивания ---------- */
  const noembedSongs = win.SONGS.filter((s) => s.noembed);
  check('есть песни без встраивания', noembedSongs.length > 0, noembedSongs.length);

  const opened = [];
  win.open = (url) => {
    opened.push(url);
    return null;
  };

  const blockedSong = noembedSongs[0];
  const blockedRow = [...doc.querySelectorAll('.row')].find((r) => r.dataset.id === blockedSong.id);
  click(blockedRow);
  // selection alone must not try to build a player for a video that cannot be embedded
  check('выбор такой песни не грузит видео', doc.getElementById('ytFrame').hidden === true);
  click(doc.getElementById('bigPlay'));
  await waitFor(() => doc.getElementById('videoBlocked').hidden === false);

  check('вместо чёрного плеера — понятное сообщение',
    doc.getElementById('videoBlocked').hidden === false);
  check('iframe не грузит запрещённое видео',
    doc.getElementById('ytFrame').hidden === true && !doc.getElementById('ytFrame').getAttribute('src'));
  check('объяснено, почему не играет',
    /только на YouTube/.test(doc.getElementById('videoBlocked').textContent));
  check('вкладку не открываем сами', opened.length === 0, opened.join(' '));

  click(doc.getElementById('openYtBtn'));
  check('кнопка «Смотреть на YouTube» ведёт на видео',
    opened.length === 1 && opened[0].includes(blockedSong.id), opened.join(' '));

  check('в списке помечены такие песни',
    doc.querySelector(`.row[data-id="${blockedSong.id}"] .row-ext`) !== null);

  // обычная песня по-прежнему играет в рамке
  const normalSong = win.SONGS.find((s) => !s.noembed);
  click([...doc.querySelectorAll('.row')].find((r) => r.dataset.id === normalSong.id));
  await waitFor(() => doc.getElementById('nowTitle').textContent === normalSong.title);
  click(doc.getElementById('bigPlay'));
  await waitFor(() => doc.getElementById('ytFrame').hidden === false);
  check('обычная песня играет в плеере',
    doc.getElementById('videoBlocked').hidden === true &&
      doc.getElementById('ytFrame').hidden === false &&
      doc.getElementById('ytFrame').src.includes(normalSong.id));

  /* ---------- двойной клик всё ещё запускает ---------- */
  const dblSong = win.SONGS.find((s) => !s.noembed && s.id !== normalSong.id);
  const dblRow = [...doc.querySelectorAll('.row')].find((r) => r.dataset.id === dblSong.id);
  click(dblRow);
  check('первый клик только выбирает',
    doc.getElementById('ytFrame').hidden === true || !doc.getElementById('ytFrame').src.includes(dblSong.id));
  dblRow.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  await waitFor(() => doc.getElementById('nowTitle').textContent === dblSong.title &&
    doc.getElementById('ytFrame').hidden === false);
  check('двойной клик запускает видео',
    doc.getElementById('ytFrame').src.includes(dblSong.id) && doc.getElementById('btnPlayLabel').textContent === 'Пауза');

  /* ---------- отчёт ---------- */
  console.log('');
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`);
  }
  if (errors.length) console.log('\nОшибки JS:\n' + errors.join('\n'));
  console.log(`\n${results.length - failed}/${results.length} проверок пройдено, ${errors.length} ошибок JS\n`);
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => {
  console.error('ТЕСТ УПАЛ:', e.message);
  console.error(errors);
  process.exit(1);
});
