import { create } from "zustand";

/** Which dashboard overlay sheet is open (prototype `sheet` state). */
export type DashboardSheetKind = "support" | "payment" | "manage";

interface DashboardSheetState {
  sheet: DashboardSheetKind | null;
  openSheet: (kind: DashboardSheetKind) => void;
  closeSheet: () => void;
}

/**
 * Global open-overlay state for the responsive Support / Payment / Manage sheets.
 * The nav + management rows call `openSheet`; the host in the my-account layout
 * renders the matching sheet via `SheetShell`.
 */
export const useDashboardSheetStore = create<DashboardSheetState>((set) => ({
  sheet: null,
  openSheet: (kind) => set({ sheet: kind }),
  closeSheet: () => set({ sheet: null }),
}));
