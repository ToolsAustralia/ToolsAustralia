export function addPassiveScroll(
  target: Window | HTMLElement,
  fn: () => void
): () => void {
  const handler = () => fn();
  target.addEventListener("scroll", handler, { passive: true });
  return () => target.removeEventListener("scroll", handler);
}

export function addThrottledResize(fn: () => void): () => void {
  let raf = 0;
  const handler = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn();
    });
  };
  window.addEventListener("resize", handler, { passive: true });
  return () => {
    window.removeEventListener("resize", handler);
    if (raf) cancelAnimationFrame(raf);
  };
}

export function addRAFScrollListener(
  target: Window | HTMLElement,
  fn: (scrollY: number) => void
): () => void {
  let raf = 0;
  const isWindow = target === window;
  const handler = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      fn(isWindow ? window.scrollY : (target as HTMLElement).scrollTop);
    });
  };
  target.addEventListener("scroll", handler, { passive: true });
  return () => {
    target.removeEventListener("scroll", handler);
    if (raf) cancelAnimationFrame(raf);
  };
}
