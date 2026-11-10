// Used only by the explicit mutation audit. Never writes application files.
export const faults = {
  search: {
    file: "src/catalog/catalog.js",
    from: "return (song) => {",
    to: "return (song) => { return true;",
    suite: "steps",
    assertion: "поиск «максим»",
  },
  selection: {
    file: "src/features/player/player.js",
    from: "el.nowTitle.textContent = song.title;",
    to: 'el.nowTitle.textContent = "BROKEN";',
    suite: "scenarios",
    assertion: "точные строки куплета",
  },
  pause: {
    file: "src/features/player/player.js",
    from: 'sendPlayerCommand(el.frame, "pauseVideo");',
    to: 'sendPlayerCommand(el.frame, "playVideo");',
    suite: "scenarios",
    assertion: "Space ставит на паузу",
  },
  lyrics: {
    file: "src/features/lyrics.js",
    from: "escapeHtml(line)",
    to: '"BROKEN"',
    suite: "scenarios",
    assertion: "точные строки куплета",
  },
  random: {
    file: "src/features/actions.js",
    from: "if (list.length > 1 && pick.id === state.currentId)",
    to: "if (false)",
    suite: "scenarios",
    assertion: "случайная песня не повторяется",
  },
  language: {
    file: "src/catalog/filter.js",
    from: "if (state.lang && song.lang !== state.lang) return false;",
    to: "if (false) return false;",
    suite: "scenarios",
    assertion: "все пересечения категории, жанра и языка",
  },
  sorting: {
    file: "src/catalog/filter.js",
    from: "return list.sort(SORTERS[state.sort] || SORTERS.artist);",
    to: "return list.sort(SORTERS[state.sort] || SORTERS.artist).reverse();",
    suite: "scenarios",
    assertion: "точный порядок всех песен: artist",
  },
};

export function applyFault(source, fault) {
  if (!source.includes(fault.from) || fault.from === fault.to)
    throw new Error("Mutation did not match a unique application statement");
  if (source.indexOf(fault.from) !== source.lastIndexOf(fault.from))
    throw new Error("Mutation statement is ambiguous");
  return source.replace(fault.from, fault.to);
}
