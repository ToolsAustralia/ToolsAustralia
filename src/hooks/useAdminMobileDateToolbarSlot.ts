"use client";

import { useLayoutEffect, useState } from "react";
import { ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID } from "@/app/admin/component/adminMobileDateToolbarSlot";
import { useIsLgUp } from "@/hooks/useIsLgUp";

/** Resolve layout slot + breakpoint for portaling DateRangeToggle under admin header on mobile */
export function useAdminMobileDateToolbarSlot() {
  const isLgUp = useIsLgUp();
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setSlotEl(document.getElementById(ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID));
  }, []);

  return { isLgUp, slotEl };
}
