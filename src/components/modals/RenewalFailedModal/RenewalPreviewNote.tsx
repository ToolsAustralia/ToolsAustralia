"use client";

import { Sparkles } from "lucide-react";
import type { PastDueRenewalPreview } from "@/utils/subscription/past-due-renewal-preview";

/**
 * "Settle $X → +N free entries" note, shown in the initial resolve prompt of BOTH the
 * RenewalFailedModal popup and the sheet-native PastDueResolvePanel. The values come from the
 * canonical {@link getPastDueRenewalPreview} (same source as the dashboard note, the renewal-failure
 * email, and the Klaviyo property), so the member sees a consistent cost + entries everywhere.
 */
export default function RenewalPreviewNote({ preview }: { preview: PastDueRenewalPreview }) {
  if (preview.entries == null || preview.cost == null) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-3 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />
      <p className="text-[13px] leading-snug text-amber-900 dark:text-amber-200">
        Settle <b className="font-extrabold">${preview.cost}</b> to reactivate —{" "}
        <b className="font-extrabold">{preview.entries.toLocaleString()} free entries</b> land as soon as it clears.
      </p>
    </div>
  );
}
