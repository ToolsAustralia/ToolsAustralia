import type { Transition, Variants } from "framer-motion";

/** Shared timing for modals, toasts, and other overlays */
export const MODAL_MOTION_EASE = [0.16, 1, 0.3, 1] as const;

export const MODAL_DURATION_ENTER_S = 0.26;
export const MODAL_DURATION_EXIT_S = 0.2;

/** Toast / CSS transition alignment (ms) */
export const TOAST_TRANSITION_MS = Math.round(MODAL_DURATION_ENTER_S * 1000);

export const modalTransition = (duration: number): Transition => ({
  duration,
  ease: MODAL_MOTION_EASE,
});

export const backdropVariants: Variants = {
  open: {
    opacity: 1,
    transition: modalTransition(MODAL_DURATION_ENTER_S),
  },
  closed: {
    opacity: 0,
    transition: modalTransition(MODAL_DURATION_EXIT_S),
  },
};

/** Standard centered dialog */
export const dialogPanelVariants: Variants = {
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: modalTransition(MODAL_DURATION_ENTER_S),
  },
  closed: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: modalTransition(MODAL_DURATION_EXIT_S),
  },
};

/** Slightly subtler motion when stacked (nested modals) */
export const dialogNestedPanelVariants: Variants = {
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: modalTransition(0.22),
  },
  closed: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: modalTransition(0.18),
  },
};

/** Bottom sheet — pilot / mobile */
export const sheetPanelVariants: Variants = {
  open: {
    opacity: 1,
    y: 0,
    transition: modalTransition(MODAL_DURATION_ENTER_S),
  },
  closed: {
    opacity: 0,
    y: "100%",
    transition: modalTransition(MODAL_DURATION_EXIT_S),
  },
};

/**
 * A drawer travels the full width of the viewport, not the ~8px a dialog does, so it needs
 * longer than the shared dialog timings or it reads as a snap rather than a slide.
 */
export const DRAWER_DURATION_ENTER_S = 0.34;
export const DRAWER_DURATION_EXIT_S = 0.26;

/** Decelerate in, accelerate out — the drawer should arrive settled and leave decisively. */
const DRAWER_EASE_IN = [0.32, 0.72, 0, 1] as const;
const DRAWER_EASE_OUT = [0.4, 0, 0.7, 0.35] as const;

/**
 * Right-edge drawer — full-height side panel on mobile (prize details sheet).
 *
 * Deliberately animates **transform only, at full opacity**. Fading a full-height panel
 * while it slides is what makes a drawer look muddy: mid-flight you see the blurred
 * backdrop and the page bleeding through the panel, and a non-opaque layer forces the
 * compositor to re-blend that expensive `backdrop-blur` behind it on every frame. The
 * backdrop's own fade already covers the transition.
 */
export const drawerPanelVariants: Variants = {
  open: {
    x: 0,
    transition: { duration: DRAWER_DURATION_ENTER_S, ease: DRAWER_EASE_IN },
  },
  closed: {
    x: "100%",
    transition: { duration: DRAWER_DURATION_EXIT_S, ease: DRAWER_EASE_OUT },
  },
};

export const reducedBackdropVariants: Variants = {
  open: { opacity: 1, transition: { duration: 0.12 } },
  closed: { opacity: 0, transition: { duration: 0.12 } },
};

export const reducedPanelVariants: Variants = {
  open: { opacity: 1, transition: { duration: 0.12 } },
  closed: { opacity: 0, transition: { duration: 0.12 } },
};
