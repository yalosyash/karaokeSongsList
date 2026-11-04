/* Общий интерфейс сортировки и фильтров поверх исходных select.
   Popover выводит меню поверх прокручиваемых панелей без обрезания. */
const updates = [];
export const syncDropdowns = () => updates.forEach((update) => update());

export function initDropdowns() {
  document.querySelectorAll(".select-wrap select").forEach((select) => {
    const wrap = select.parentElement;
    const label = wrap.querySelector(".select-label");
    label.id = `${select.id}Label`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "select-toggle";
    toggle.id = `${select.id}Toggle`;
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-labelledby", `${label.id} ${toggle.id}`);
    const menu = document.createElement("div");
    menu.className = "theme-menu select-menu";
    menu.id = `${select.id}Menu`;
    menu.setAttribute("popover", "auto");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-labelledby", label.id);
    toggle.setAttribute("aria-controls", menu.id);
    const options = [...select.options].map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      button.tabIndex = -1;
      button.setAttribute("role", "menuitemradio");
      button.dataset.value = option.value;
      const text = document.createElement("span");
      text.textContent = option.textContent;
      const check = document.createElement("span");
      check.className = "theme-check";
      check.textContent = "✓";
      check.setAttribute("aria-hidden", "true");
      button.append(text, check);
      menu.append(button);
      button.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close(true);
      });
      return button;
    });
    function sync() {
      toggle.textContent = select.selectedOptions[0]?.textContent || "";
      options.forEach((option) =>
        option.setAttribute(
          "aria-checked",
          String(option.dataset.value === select.value),
        ),
      );
    }
    function close(restore = false) {
      menu.hidePopover();
      toggle.setAttribute("aria-expanded", "false");
      if (restore) toggle.focus({ preventScroll: true });
    }
    function open(edge) {
      menu.showPopover();
      toggle.setAttribute("aria-expanded", "true");
      const rect = wrap.getBoundingClientRect();
      const below = innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < Math.min(menu.scrollHeight, 240) && above > below;
      menu.style.width = `${Math.min(Math.max(rect.width, 210), innerWidth - 16)}px`;
      menu.style.maxHeight = `${Math.max(0, Math.min(400, up ? above : below))}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.getBoundingClientRect().width - 8))}px`;
      menu.style.top = `${up ? rect.top - menu.getBoundingClientRect().height - 5 : rect.bottom + 5}px`;
      const target =
        edge === "last"
          ? options.at(-1)
          : edge === "first"
            ? options[0]
            : options.find((option) => option.dataset.value === select.value);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    }
    // Auto-popover может закрыться на pointerdown до события click.
    // Запоминаем состояние, чтобы повторный клик не открыл его снова.
    let openOnPointerDown = false;
    toggle.addEventListener("pointerdown", () => {
      openOnPointerDown = menu.matches(":popover-open");
    });
    toggle.addEventListener("click", (event) => {
      const wasOpen = event.detail > 0 && openOnPointerDown;
      openOnPointerDown = false;
      if (wasOpen || menu.matches(":popover-open")) close();
      else open();
    });
    menu.addEventListener("toggle", () =>
      toggle.setAttribute(
        "aria-expanded",
        String(menu.matches(":popover-open")),
      ),
    );
    wrap.addEventListener("keydown", (event) => {
      const opened = menu.matches(":popover-open");
      if (event.key === "Escape" && opened) {
        event.preventDefault();
        close(true);
      } else if (event.key === "Tab" && opened) {
        toggle.focus({ preventScroll: true });
        close();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (!opened)
          return open(
            event.key === "End" || event.key === "ArrowUp"
              ? "last"
              : event.key === "Home"
                ? "first"
                : undefined,
          );
        const index = options.indexOf(document.activeElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
                options.length;
        options[next].focus();
      }
    });
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) close();
    });
    window.addEventListener("resize", () => close());
    document.addEventListener(
      "scroll",
      (event) => {
        if (!menu.contains(event.target)) close();
      },
      true,
    );
    select.addEventListener("change", sync);
    select.hidden = true;
    wrap.append(toggle, menu);
    updates.push(sync);
    sync();
  });
}
