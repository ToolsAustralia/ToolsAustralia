/**
 * Classic viewport scrollbar width (px): `innerWidth - clientWidth`.
 * Call while the document can still scroll and **after** any temporary `scrollbar-gutter` override
 * on `<html>` so the value matches what disappears when scroll is locked.
 */
export function getViewportScrollbarWidthPx(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const docEl = document.documentElement;
  const body = document.body;
  return Math.round(
    Math.max(0, window.innerWidth - docEl.clientWidth, body ? window.innerWidth - body.clientWidth : 0)
  );
}
