"use client";

import React from "react";
import { Share2, Zap } from "lucide-react";

interface QuickActionsProps {
  onReferFriend: () => void;
  onGetMoreEntries: () => void;
  showGetMoreEntries?: boolean;
  className?: string;
}

export default function QuickActions({
  onReferFriend,
  onGetMoreEntries,
  showGetMoreEntries = false,
  className = "",
}: QuickActionsProps) {
  return (
    <div className={`px-4 sm:px-6 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className={`flex flex-row flex-wrap gap-2 sm:gap-3 w-full ${showGetMoreEntries ? "" : ""}`}>
          <button
            onClick={onReferFriend}
            className="group relative flex-1 min-w-0 refer-friend-cta overflow-hidden rounded-xl font-bold px-2.5 py-3.5 sm:px-3 sm:py-4 text-black dark:text-gray-900 bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-400 dark:from-amber-500 dark:via-amber-400 dark:to-orange-500 border border-amber-400/50 dark:border-amber-400/30 shadow-[0_2px_12px_rgba(251,191,36,0.35),0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_20px_rgba(251,191,36,0.15)] hover:shadow-[0_4px_20px_rgba(251,191,36,0.45),0_0_1px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_6px_28px_rgba(0,0,0,0.5),0_0_28px_rgba(251,191,36,0.2)] transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="refer-friend-shimmer rounded-xl" aria-hidden="true" />
            <div className="absolute -top-3 -right-1 z-20">
              <span
                className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-wider text-white animate-badge-pulse"
                style={{
                  background: "linear-gradient(135deg, #dc2626 0%, #ea580c 40%, #dc2626 70%, #b91c1c 100%)",
                  boxShadow: "0 0 12px rgba(238,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                GET 100 FREE ENTRIES
              </span>
            </div>
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Refer a Friend</span>
            </span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </button>

          {showGetMoreEntries && (
            <button
              onClick={onGetMoreEntries}
              className="group relative flex-1 min-w-0 get-more-entries-cta overflow-hidden rounded-xl font-bold px-2.5 py-3.5 sm:px-3 sm:py-4 text-black dark:text-gray-900 bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 border border-amber-500/40 dark:border-amber-400/25 shadow-[0_2px_12px_rgba(251,191,36,0.4),0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_24px_rgba(234,179,8,0.35)] hover:shadow-[0_4px_20px_rgba(251,191,36,0.5),0_0_24px_rgba(234,179,8,0.4)] dark:hover:shadow-[0_6px_28px_rgba(0,0,0,0.5),0_0_40px_rgba(234,179,8,0.45)] transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="get-more-entries-shimmer rounded-xl" aria-hidden="true" />
              <div className="absolute -top-3 -right-1 z-20">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-wider text-white animate-badge-pulse"
                  style={{
                    background: "linear-gradient(135deg, #dc2626 0%, #ea580c 40%, #dc2626 70%, #b91c1c 100%)",
                    boxShadow: "0 0 12px rgba(238,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}
                >
                  50% OFF
                </span>
              </div>
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Get More Entries</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
