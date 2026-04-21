"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { rewardsEnabled } from "@/config/featureFlags";

export type EntryRewardDrawType = "major" | "mini";

export interface EntryRewardToastOptions {
  entries?: number;
  points?: number;
  drawType: EntryRewardDrawType;
  /** Breadcrumb for debugging / future analytics */
  source: string;
}

/**
 * Global success toast for entry and reward grants (purchase, upsell, draws, retention offers).
 */
export function useEntryRewardToast() {
  const { showToast } = useToast();

  return useCallback(
    (opts: EntryRewardToastOptions) => {
      const parts: string[] = [];
      if (opts.entries != null && opts.entries > 0) {
        parts.push(
          `+${opts.entries.toLocaleString()} ${opts.drawType === "major" ? "Major Draw" : "Mini Draw"} entries`
        );
      }
      if (rewardsEnabled() && opts.points != null && opts.points > 0) {
        parts.push(`+${opts.points.toLocaleString()} reward points`);
      }
      if (!parts.length) return;

      console.debug("[entry-reward-toast]", opts.source, opts);
      showToast({
        type: "success",
        title: "Reward added",
        message: parts.join(" · "),
        duration: 6000,
      });
    },
    [showToast]
  );
}
