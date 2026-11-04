let tooltip;
let tooltipAnchor;
let tooltipTimer;
let previousDescription;

export function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (tooltip) tooltip.hidden = true;
  if (tooltipAnchor) {
    if (previousDescription)
      tooltipAnchor.setAttribute("aria-describedby", previousDescription);
    else tooltipAnchor.removeAttribute("aria-describedby");
  }
  previousDescription = null;
  tooltipAnchor = null;
}

/** Отдельный слой не обрезается прокручиваемым списком. */
export function wireTooltips() {
  tooltip = document.createElement("div");
  tooltip.id = "app-tooltip";
  tooltip.className = "app-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);

  const show = (anchor) => {
    clearTimeout(tooltipTimer);
    if (!anchor.isConnected) {
      hideTooltip();
      return;
    }
    if (anchor !== tooltipAnchor || tooltip.hidden) {
      previousDescription = anchor.getAttribute("aria-describedby");
    }
    tooltipAnchor = anchor;
    tooltip.textContent = anchor.dataset.tooltip;
    anchor.setAttribute(
      "aria-describedby",
      [previousDescription, "app-tooltip"].filter(Boolean).join(" "),
    );
    tooltip.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const gap = 15;
    const above = anchor.dataset.tooltipPlacement === "top";
    const preferredLeft =
      above ? rect.left + (rect.width - width) / 2 :
      rect.right + gap + width <= innerWidth - 12
        ? rect.right + gap
        : rect.left - gap - width;
    const left = Math.max(12, Math.min(preferredLeft, innerWidth - width - 12));
    const top = Math.min(
      above
        ? (rect.top >= height + gap + 12 ? rect.top - height - gap : rect.bottom + gap)
        : rect.top + (rect.height - height) / 2,
      innerHeight - height - 12,
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  };

  document.addEventListener("pointerover", (event) => {
    const anchor = event.target.closest("[data-tooltip]");
    if (anchor && event.pointerType !== "touch" && anchor !== tooltipAnchor) {
      hideTooltip();
      tooltipAnchor = anchor;
      tooltipTimer = setTimeout(() => show(anchor), 700);
    }
  });
  document.addEventListener("pointerout", (event) => {
    if (
      tooltipAnchor?.contains(event.target) &&
      !tooltipAnchor.contains(event.relatedTarget)
    )
      hideTooltip();
  });
  document.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-tooltip]")) {
      hideTooltip();
      show(event.target);
    }
  });
  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("click", hideTooltip);
  window.addEventListener("resize", hideTooltip);
  new MutationObserver(() => {
    if (tooltipAnchor && (!tooltipAnchor.isConnected || tooltipAnchor.hidden))
      hideTooltip();
    else if (
      tooltipAnchor &&
      !tooltip.hidden &&
      tooltip.textContent !== tooltipAnchor.dataset.tooltip
    )
      tooltip.textContent = tooltipAnchor.dataset.tooltip;
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-tooltip", "hidden"],
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && tooltipAnchor) {
        hideTooltip();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
