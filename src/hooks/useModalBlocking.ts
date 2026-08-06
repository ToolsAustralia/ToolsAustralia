"use client";

import { useEffect, useRef } from "react";

import { getViewportScrollbarWidthPx } from "@/utils/dom/getScrollbarWidth";

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

function applyLock() {
  savedScrollY = window.scrollY;
  const html = document.documentElement;
  prevScrollbarGutter = html.style.scrollbarGutter;

  // `scrollbar-gutter: stable` keeps an empty lane once the root scrollbar is suppressed,
  // which reads as "content jumped left and left a dead strip". Release it, THEN measure —
  // the measurement has to happen before `position: fixed` removes the scrollbar.
  html.style.scrollbarGutter = "auto";
  const scrollbarWidth = getViewportScrollbarWidthPx();

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

/**
 * `iframe` is in here deliberately. Stripe's Payment Element renders the card fields inside
 * one, and a selector that omits it computes a `last` that sits BEFORE the iframe — so the
 * wrap-around fires early and Tab skips the card inputs entirely, making payment unreachable
 * by keyboard. That would be a worse bug than the one this trap fixes.
 */
const FOCUSABLE =
  'button, [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Stack of currently-active traps, innermost last. Only the top one acts.
 *
 * Without this, two open modals means two document-level capture listeners, and BOTH run on
 * every Tab. Because `ModalContainer` portals to <body>, a nested modal is a DOM *sibling* of
 * the outer one — so the outer trap sees `!panel.contains(active)` and yanks focus into
 * itself. Today the inner one happens to win because it registered last and therefore runs
 * last, quietly undoing the theft. That is attach-order luck, not design: the outer modal
 * re-running its effect (an `active` or `closeOnEscape` change) re-attaches it last and flips
 * the outcome, at which point Tab inside the inner modal throws you into the outer one.
 *
 * A stack makes it deterministic and stops the per-keystroke focus tug-of-war.
 */
const trapStack: symbol[] = [];

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
  onClose: () => void,
  options?: {
    /**
     * Close on Escape. Default true.
     *
     * Set false for a surface that deliberately refuses casual dismissal — one mid-request,
     * or one whose backdrop is already inert. The trap and focus restore still apply; only
     * the key is dropped. Without this the hook would hand a keyboard user a dismissal route
     * the pointer does not have, which is how you abandon a payment with Escape.
     */
    closeOnEscape?: boolean;
  }
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /**
   * A REF, not a dep. `closeOnEscape` is derived from props that legitimately change WHILE the
   * modal is open — ModalContainer maps it from `closeOnBackdrop`, and admin modals flip that
   * to false for the duration of a request. As a dep it tore the effect down mid-open, and
   * teardown calls `previouslyFocused.focus()` — which is the trigger BEHIND the scrim. A
   * screen reader would leave the dialog, land on a covered control, then get dragged back and
   * re-announced 30ms later. Reading it through a ref keeps the handler current without
   * remounting the trap.
   */
  const closeOnEscapeRef = useRef(options?.closeOnEscape ?? true);
  closeOnEscapeRef.current = options?.closeOnEscape ?? true;

  useEffect(() => {
    if (!active) return;

    const token = Symbol("modal-trap");
    trapStack.push(token);
    /** Only the innermost open modal owns the keyboard. */
    const isTopmost = () => trapStack[trapStack.length - 1] === token;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // A tick, so the panel has painted before focus lands — focusing an unpainted node is a
    // no-op in some browsers. `preventScroll` because the panel may be mid-transition.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      // Same reason as the keydown guard: if this modal has since been covered by another,
      // pulling focus back would drag the user out of the one actually on top.
      if (!isTopmost()) return;
      if (panel.contains(document.activeElement)) return;
      panel.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      // An outer modal must not answer for keys aimed at the one stacked on top of it —
      // neither by trapping its Tab nor by closing itself on its Escape.
      if (!isTopmost()) return;
      if (e.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        // Yield to an open dropdown inside the panel. Escape on a `<Select>` means "close the
        // select", not "discard this form" — and before this guard it did the latter, taking a
        // half-filled admin form (Create Experiment, targeting, multiplier config) with it, no
        // confirmation and no undo. `[data-dropdown-list]` is the existing marker Select,
        // Dropdown and BirthdatePicker already render, and that ModalContainer itself keys off.
        // One Escape closes the dropdown, the next closes the modal — the expected two-step.
        if (panelRef.current?.querySelector("[data-dropdown-list]")) return;
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
      const i = trapStack.lastIndexOf(token);
      if (i !== -1) trapStack.splice(i, 1);
      // Splice by identity, not pop(): overlays do not always close innermost-first (a route
      // change can unmount an outer one while an inner is still up), and popping blindly would
      // hand ownership to a trap that has already gone.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, panelRef]);
}
