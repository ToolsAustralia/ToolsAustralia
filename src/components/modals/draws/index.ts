// Every modal reachable from the four admin draws pages
// (/admin/major-draw, /admin/mini-draws, /admin/draw-results, /admin/upcoming-draws).
//
// Grouped so the set is discoverable and extendable — src/components/modals/ is
// otherwise 60+ flat entries with no signal about which of them belong together.
//
// What deliberately does NOT live here:
//  - src/components/modals/ui/*  — Button, Input, ModalContainer, ImageUpload, …
//    are shared primitives, not draws-specific.
//  - ConfirmationModal           — 20+ non-draws callers.
//
// Create and edit stay as SEPARATE components for major draws. AdminMajorDrawModal
// owns the scheduled-months restriction, the 8:30 PM AEST default, the activation /
// freeze auto-derivation and the 30-minute warning; MajorDrawEditModal owns the
// configurationLocked gating. Zero overlap — a `mode` prop would fork most of the
// component. They share field sections instead. See the Task 11 table in
// docs/superpowers/plans/2026-07-30-admin-draws-revamp.md for the measurements.

// The shared shell. IT carries the `admin-draws` class, because ModalContainer
// portals to document.body and the page's token scope does not reach through a
// portal. Any new draws modal should use this rather than ModalContainer directly.
export { default as DrawModalShell } from "./DrawModalShell";

export { default as WinnerSelectionModal } from "./WinnerSelectionModal";
export type { WinnerSelectionData, WinnerSelectionDrawType } from "./WinnerSelectionModal";

export { default as WinnerEditModal } from "./WinnerEditModal";
export { default as ParticipantsModal } from "./ParticipantsModal";
export { default as ExportModal } from "./ExportModal";

export { default as AdminMajorDrawModal } from "./AdminMajorDrawModal";
export { default as MajorDrawEditModal } from "./MajorDrawEditModal";

// The mini-draw pair DOES collapse in Task 11 — identical field sets, differing only
// in displayOrder + lock handling and the submit target. Until then, both are exported.
export { default as AdminMiniDrawModal } from "./AdminMiniDrawModal";
export { default as MiniDrawEditModal } from "./MiniDrawEditModal";
export type { AdminMiniDrawSummary, MiniDrawEditPayload } from "./MiniDrawEditModal";

// Shown instead of the edit form when configurationLocked is set. Every edit
// entry point on a locked draw routes here through one guard in the container.
export { default as DrawLockedModal } from "./DrawLockedModal";
