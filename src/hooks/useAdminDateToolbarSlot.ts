"use client";

import { useLayoutEffect, useState } from "react";
import { ADMIN_DATE_TOOLBAR_SLOT_ID } from "@/app/admin/component/adminDateToolbarSlot";

/**
 * Resolve the admin header's date-toolbar portal target.
 *
 * `null` on the first paint (the slot has not mounted yet) and for any tab not listed in
 * ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR — consumers render their control inline in that case.
 *
 * This used to also return `isLgUp`, back when the header slot was mobile-only and desktop
 * placed the control inside the scroll container. Every consumer now portals at all
 * breakpoints, so the breakpoint is no longer part of the decision.
 */
export function useAdminDateToolbarSlot() {
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setSlotEl(document.getElementById(ADMIN_DATE_TOOLBAR_SLOT_ID));
  }, []);

  return { slotEl };
}
