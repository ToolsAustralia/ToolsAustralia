"use client";

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
      <span className="flex min-w-[54px] shrink-0 flex-col items-center gap-0.5 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 px-3 py-2 text-white shadow-[0_8px_18px_-8px_rgba(217,119,6,.55),inset_0_0_0_1px_rgba(253,211,120,.45)]">
        <span className="num font-['Poppins'] text-[19px] font-black leading-none tracking-[-.02em] [text-shadow:0_1px_1px_rgba(120,60,0,.3)]">
          +{preview.entries.toLocaleString()}
        </span>
        <span className="text-[8px] font-extrabold uppercase leading-[1.1] tracking-[0.1em] opacity-90">
          Free
          <br />
          Entries
        </span>
      </span>
      <p className="min-w-0 text-[13px] leading-snug text-muted-token">
        Settle <b className="font-semibold text-primary-token dark:text-white">${preview.cost}</b> to reactivate — your free entries land as soon as it clears.
      </p>
    </div>
  );
}
