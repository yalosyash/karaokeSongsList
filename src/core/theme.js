/* Выполняется до CSS, чтобы сохранённая тема появилась без вспышки другой палитры.
   Хранилище темы изолировано от модулей приложения для ранней загрузки. */
(() => {
  const key = "karaoke.theme.v1";
  const themes = new Set([
    "original",
    "amethyst",
    "indigo",
    "cherry",
    "emerald",
    "vinyl",
    "lavender",
  ]);
  const root = document.documentElement;
  let current = "original";

  function apply(value) {
    current = themes.has(value) ? value : "original";
    root.dataset.theme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    const backgrounds = {
      original: "#0a0a11",
      amethyst: "#171322",
      indigo: "#111827",
      cherry: "#1c121b",
      emerald: "#101d1a",
      vinyl: "#211914",
      lavender: "#e4deec",
    };
    if (meta) meta.content = backgrounds[current];
    document.querySelectorAll("[data-theme-option]").forEach((option) => {
      option.setAttribute(
        "aria-checked",
        String(option.dataset.themeOption === current),
      );
    });
  }

  try {
    current = localStorage.getItem(key);
  } catch {}
  apply(current);

  document.addEventListener("DOMContentLoaded", () => {
    const picker = document.getElementById("themePicker");
    const toggle = document.getElementById("themeToggle");
    const menu = document.getElementById("themeMenu");
    const options = [...menu.querySelectorAll("[data-theme-option]")];
    apply(current);

    function close(restoreFocus = false) {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }

    function open(last = false) {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      (last
        ? options.at(-1)
        : options.find((option) => option.dataset.themeOption === current)
      ).focus();
    }

    toggle.addEventListener("click", () => (menu.hidden ? open() : close()));
    options.forEach((option) =>
      option.addEventListener("click", () => {
        apply(option.dataset.themeOption);
        try {
          localStorage.setItem(key, current);
        } catch {}
        close(true);
      }),
    );
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (menu.hidden) {
          open(event.key === "ArrowUp" || event.key === "End");
          return;
        }
        const index = options.indexOf(document.activeElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
                options.length;
        options[next].focus();
      } else if (event.key === "Tab" && !menu.hidden) {
        // Продолжить обычный порядок Tab от кнопки, затем скрыть меню.
        toggle.focus({ preventScroll: true });
        close();
      }
    });
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) close();
    });
    picker.addEventListener("focusout", (event) => {
      if (!picker.contains(event.relatedTarget)) close();
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
