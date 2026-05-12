"use client";

import React from "react";
import { cva } from "class-variance-authority";
import { TIER_OPTIONS, type RedeemableTierId } from "./types";

/**
 * Tier-chip style variants. Selected state uses the tier-specific palette + a
 * red ring; unselected falls back to a neutral white/dark surface.
 *
 * Class strings preserved byte-identically from the original CampaignTargetingModal
 * monolith so visual output is unchanged.
 */
const tierChip = cva("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors", {
  variants: {
    tier: {
      "tradie-subscription": "",
      "foreman-subscription": "",
      "boss-subscription": "",
    },
    selected: {
      true: "ring-2 ring-red-500/60",
      false: "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300",
    },
  },
  compoundVariants: [
    {
      tier: "tradie-subscription",
      selected: true,
      className:
        "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    },
    {
      tier: "foreman-subscription",
      selected: true,
      className:
        "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    },
    {
      tier: "boss-subscription",
      selected: true,
      className:
        "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    },
  ],
  defaultVariants: {
    selected: false,
  },
});

interface TierMultiSelectProps {
  selected: Set<RedeemableTierId>;
  onToggle: (id: RedeemableTierId) => void;
}

export default function TierMultiSelect({ selected, onToggle }: TierMultiSelectProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-neutral-400">Membership tier</span>
      <div className="flex flex-wrap gap-2">
        {TIER_OPTIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t.id)}
            className={tierChip({ tier: t.id, selected: selected.has(t.id) })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
