/**
 * Centralized z-index hierarchy for consistent stacking across the app.
 *
 * Hierarchy (lowest to highest):
 * - Z_MODAL_BASE: Base modal layer (ModalContainer, UserDetailModal, etc.)
 * - Z_MODAL_NESTED: Nested modals (opened from within another modal)
 * - Z_TOAST_LOADING: Toast notifications, loading spinners, success screens - always on top
 */
export const Z_INDEX = {
  /** Base modal layer - standard modals */
  MODAL_BASE: 10000,
  /** Nested modals - modals opened from within another modal (e.g. View User from Revenue Breakdown) */
  MODAL_NESTED: 10100,
  /** Nested nested - confirmation dialogs within nested modals */
  MODAL_NESTED_SECONDARY: 10200,
  /** Toast, loading spinners, success screens - always visible above everything */
  TOAST_LOADING: 99999,
} as const;
