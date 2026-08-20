"use client";

import { useLayoutEffect, useState } from "react";
import { ADMIN_DATE_TOOLBAR_SLOT_ID } from "@/app/admin/component/adminDateToolbarSlot";
import { useIsLgUp } from "@/hooks/useIsLgUp";

/**
 * Resolve the admin header's date-filter slot plus the current breakpoint.
 *
 * Both are needed together: the slot decides WHERE the control renders (always the header) and
 * `isLgUp` decides WHICH form — the compact dropdown on mobile, the inline preset row on desktop.
 *
 * `slotEl` is null on the very first paint (the layout effect has not run yet), so callers must
 * handle that rather than assuming the portal target exists.
 */
export function useAdminDateToolbarSlot() {
  const isLgUp = useIsLgUp();
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setSlotEl(document.getElementById(ADMIN_DATE_TOOLBAR_SLOT_ID));
  }, []);

  return { isLgUp, slotEl };
}
