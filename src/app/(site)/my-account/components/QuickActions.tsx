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
            className="group relative flex-1 min-w-0 bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 dark:from-yellow-400 dark:via-amber-400 dark:to-orange-500 text-black dark:text-gray-900 px-2.5 py-3.5 sm:px-3 sm:py-4 rounded-xl font-bold hover:from-yellow-400 hover:to-orange-500 dark:hover:from-yellow-500 dark:hover:to-orange-600 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Refer a Friend</span>
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-white/40 to-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>

          {showGetMoreEntries && (
            <button
              onClick={onGetMoreEntries}
              className="group relative flex-1 min-w-0 get-more-entries-cta bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 text-black dark:text-gray-900 px-2.5 py-3.5 sm:px-3 sm:py-4 rounded-xl font-bold shadow-[0_4px_20px_rgba(0,0,0,0.25),0_0_30px_rgba(234,179,8,0.4)] transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="get-more-entries-shimmer rounded-xl" aria-hidden="true" />
              <div className="absolute -top-2 -right-1 z-20">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white animate-badge-pulse"
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
