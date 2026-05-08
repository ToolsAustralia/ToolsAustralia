"use client";

import React from "react";

/** Three skeleton cards shown while past draws load. Mirrors PastDrawCard's
 * row layout (image left, content right) so the swap-in is invisible. */
const LoadingState: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="animate-pulse rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900/80"
      >
        <div className="flex flex-row gap-3 sm:gap-4">
          <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-gray-200 dark:bg-neutral-800" />
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-16" />
            <div className="h-5 bg-gray-200 dark:bg-neutral-800 rounded w-3/4" />
            <div className="flex gap-3">
              <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-24" />
              <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-20" />
            </div>
            <div className="h-7 bg-amber-100 dark:bg-amber-900/40 rounded-lg w-24" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default LoadingState;
