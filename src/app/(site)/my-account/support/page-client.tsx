"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";

/**
 * Support is now an overlay sheet (opened from the nav), not a page. This route
 * is kept for deep links / bookmarks: it opens the dashboard with the Support
 * sheet showing. The content lives in `components/sheets/SupportSheet`.
 */
export default function SupportRoute() {
  const router = useRouter();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);

  useEffect(() => {
    openSheet("support");
    router.replace("/my-account");
  }, [openSheet, router]);

  return null;
}
