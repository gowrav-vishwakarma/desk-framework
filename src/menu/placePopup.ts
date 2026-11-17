export interface PopupAnchor {
  left: number;
  top: number;
  bottom: number;
}

export interface PopupSize {
  width: number;
  height: number;
}

/**
 * Where a fixed-position popup goes: under the anchor, above it when the bottom of the window is too
 * close, and always inside the window. A point (a click) is an anchor with `top` equal to `bottom`.
 */
export function placePopup(
  anchor: PopupAnchor,
  panel: PopupSize,
  options: { margin?: number; gap?: number; preferAbove?: boolean } = {},
): { top: number; left: number } {
  const margin = options.margin ?? 4;
  const gap = options.gap ?? 2;
  const maxLeft = Math.max(margin, window.innerWidth - panel.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - panel.height - margin);
  const below = anchor.bottom + gap;
  const above = anchor.top - panel.height - gap;
  let top = options.preferAbove ? above : below;
  if (panel.height > 0) {
    if (top + panel.height > window.innerHeight - margin) top = above;
    if (top < margin) top = below;
  }
  return {
    top: Math.min(Math.max(top, margin), maxTop),
    left: Math.min(Math.max(anchor.left, margin), maxLeft),
  };
}
