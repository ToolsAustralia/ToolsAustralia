"use client";

import React from "react";
import { Info } from "lucide-react";

const MESSAGE =
  "You are not eligible to win but you can still enjoy the member benefits. You cannot participate in our giveaways.";

interface GiveawayEligibilityNoticeProps {
  show: boolean;
  className?: string;
}

/**
 * Information message shown when user is ineligible for giveaways
 * (e.g. SA/ACT residents or under 18)
 */
export default function GiveawayEligibilityNotice({ show, className = "" }: GiveawayEligibilityNoticeProps) {
  if (!show) return null;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200 ${className}`}
    >
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
      <p className="leading-snug">{MESSAGE}</p>
    </div>
  );
}
