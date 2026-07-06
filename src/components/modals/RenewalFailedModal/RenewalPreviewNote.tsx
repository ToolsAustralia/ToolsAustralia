"use client";

import React from "react";
import FreeEntriesChip from "@/components/ui/FreeEntriesChip";
import type { PastDueRenewalPreview } from "@/utils/subscription/past-due-renewal-preview";

/**
 * "Settle $X → +N free entries" note, shown in the initial resolve prompt of BOTH the
 * RenewalFailedModal popup and the sheet-native PastDueResolvePanel. The values come from the
 * canonical {@link getPastDueRenewalPreview} (same source as the dashboard note, the renewal-failure
 * email, and the Klaviyo property), so the member sees a consistent cost + entries everywhere.
 *
 * Uses the SAME amber "free entries" stat chip as the dashboard EntryWallet past-due note
 * (the countdown-CDBox recipe), so the resolve sheet/popup and the dashboard read as one design.
 */
export default function RenewalPreviewNote({ preview }: { preview: PastDueRenewalPreview }) {
  if (preview.entries == null || preview.cost == null) return null;
  return (
    <div className="mb-4 flex items-center gap-3">
      <FreeEntriesChip value={preview.entries} tone="amber" />
      <p className="min-w-0 text-[13px] leading-snug text-muted-token">
        Settle <b className="font-semibold text-primary-token dark:text-white">${preview.cost}</b> to reactivate — your free entries land as soon as it clears.
      </p>
    </div>
  );
}
