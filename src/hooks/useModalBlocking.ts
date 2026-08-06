"use client";

import { useEffect, useRef } from "react";

/**
 * The two things a MODAL surface owes the page behind it: it must not scroll, and it must not
 * be reachable by Tab.
 *
 * WHY THIS EXISTS AS A SHARED MODULE (2026-08-06)
 * -----------------------------------------------
 * The `/discount` filter sheet scrolled the catalogue behind it, and an audit found the same
 * gap across the site: three `/discount` overlays and two mobile filter drawers locked
 * nothing, while ~20 other overlays each hand-rolled `document.body.style.overflow` with
 * subtly different restore logic. The admin copy of the SAME drawer locked and the customer
 * one did not — proof the misses were accidental, not a design decision.
 *
 * Two things genuinely cannot be solved per-component, which is what earns this file:
 *
 * 1. REFERENCE COUNTING. Every hand-rolled copy restores unconditionally, so with two
 *    overlays open the first to close unlocks the page while the second is still up. Only a
 *    module-level count can know it is the last one out. `ModalContainer` guards against
 *    double-LOCKING (`isBodyAlreadyLocked`) but not premature UNLOCKING, so it has the same
 *    hole from the other side.
 * 2. THE iOS RECIPE. `overflow: hidden` on <body> does not stop touch-scrolling in iOS
 *    Safari. The technique that works — save scrollY, pin the body with `position: fixed;
 *    top: -Ypx`, restore scroll on release — is fiddly enough that copies drift.
 *
 * The lock body here is deliberately the SAME recipe `ModalContainer` already proved in
 * production (ModalContainer.tsx ~466-510), including the `scrollbar-gutter` dance that stops
 * content jumping sideways and the `data-modal-scroll-lock` attribute `globals.css` keys off.
 * This is not a competing mechanism; it is that one, made shareable and counted.
 *
 * WHEN NOT TO USE IT
 * ------------------
 * Only MODAL surfaces. The test is the surface's own ARIA: something asserting
 * `aria-modal="true"` (or painting a full-viewport scrim) is modal and must block; something
 * anchored to a trigger asserting `aria-expanded`/`aria-haspopup` is a popover and must NOT —
 * locking a dropdown, a toast or the support-chat bubble would freeze the page for no reason.
 */

/** Live count of surfaces currently demanding the lock. Module scope: that is the point. */
let lockCount = 0;
let savedScrollY = 0;
let prevScrollbarGutter = "";

function getScrollbarWidthPx(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function applyLock() {
  savedScrollY = window.scrollY;
  const html = document.documentElement;
  prevScrollbarGutter = html.style.scrollbarGutter;

  // `scrollbar-gutter: stable` keeps an empty lane once the root scrollbar is suppressed,
  // which reads as "content jumped left and left a dead strip". Release it, THEN measure —
  // the measurement has to happen before `position: fixed` removes the scrollbar.
  html.style.scrollbarGutter = "auto";
  const scrollbarWidth = getScrollbarWidthPx();

  const body = document.body;
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.width = "100%";

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
    html.style.setProperty("--scrollbar-width", `${scrollbarWidth}px`);
    html.setAttribute("data-modal-scroll-lock", "");
  }
}

function releaseLock() {
  const html = document.documentElement;
  const body = document.body;
  html.style.scrollbarGutter = prevScrollbarGutter;
  body.style.overflow = "";
  body.style.position = "";
  body.style.top = "";
  body.style.width = "";
  body.style.paddingRight = "";
  html.style.removeProperty("--scrollbar-width");
  html.removeAttribute("data-modal-scroll-lock");
  window.scrollTo(0, savedScrollY);
}

/**
 * Lock page scroll while `active`. Safe to nest — the page unlocks only when the LAST holder
 * releases, and the scroll position is restored from wherever the first holder locked it.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    // Defer to an existing ModalContainer lock rather than fighting it: if the body is
    // already pinned, another mechanism owns the scroll position and re-pinning would save a
    // scrollY of 0 and drop the user at the top on release.
    if (lockCount === 0 && document.body.style.position === "fixed") return;

    lockCount += 1;
    if (lockCount === 1) applyLock();

    return () => {
      lockCount -= 1;
      if (lockCount === 0) releaseLock();
    };
  }, [active]);
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Make a modal panel keyboard-honest: focus moves in on open, Tab cannot leave, Escape
 * closes, and focus returns to whatever opened it.
 *
 * Lifted from the WinnersTestimony implementation, which was the best of the copies already
 * in the tree — note the `!panel.contains(active)` arms, which RECAPTURE focus that has
 * already escaped (e.g. it started on the trigger behind the scrim) rather than only wrapping
 * at the ends. Without that, the first Tab walks into the background.
 *
 * Pass this whenever you set `aria-modal="true"`. That attribute tells assistive tech the
 * rest of the page is inert; if nothing enforces it, the claim is simply false, which is
 * worse than not claiming it.
 */
export function useModalA11y(
  active: boolean,
  panelRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // A tick, so the panel has painted before focus lands — focusing an unpainted node is a
    // no-op in some browsers. `preventScroll` because the panel may be mid-transition.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(document.activeElement)) return;
      panel.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase: a panel child that stops propagation must not be able to defeat the trap.
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, panelRef]);
}
