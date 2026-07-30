// Shared presentation primitives for the four admin draws pages.
//
// These own LAYOUT ONLY. Fetching, filter state, pagination and modals stay in
// the page containers under src/app/admin/component/ — they already own that
// logic, and lifting half of it here would split one piece of state across two
// files for no gain.
//
// The design tokens these consume are scoped to `.admin-draws`, which
// DrawsPageShell carries. Render any of these outside that shell and every
// var(--panel) / var(--m-btn-h) resolves to nothing.

export { default as DrawsPageShell } from "./DrawsPageShell";
export { default as DrawsListPage } from "./DrawsListPage";
export { default as DrawsKpiStrip } from "./DrawsKpiStrip";
export { default as DrawsToolbar } from "./DrawsToolbar";
export { default as DrawsTable } from "./DrawsTable";
export { default as DrawInspector } from "./DrawInspector";
export { default as DrawStatusPill } from "./DrawStatusPill";
export { default as MiniDrawCard } from "./MiniDrawCard";
export type { MiniDrawCardDraw } from "./MiniDrawCard";

// Major Draw page pieces
export { default as DrawStatusRibbon } from "./DrawStatusRibbon";
export type { RibbonStat } from "./DrawStatusRibbon";
export { default as DrawGatesCard } from "./DrawGatesCard";
export type { DrawGate } from "./DrawGatesCard";
export { default as EntryPoolCard } from "./EntryPoolCard";
export type { TopEntrant } from "./EntryPoolCard";

export type {
  DrawsListVariant,
  DrawStatus,
  DrawRow,
  DrawGroup,
  DrawsDataState,
  DrawKpi,
  DrawFilter,
  DrawToolbarAction,
} from "./types";
