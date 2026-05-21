"use client";

import React from "react";
import { Ticket } from "lucide-react";

const EMPTY_TITLE = "No past draws yet";
const EMPTY_MESSAGE =
  "You haven't participated in any completed major draws yet. Enter the current draw to see your history build up here.";

/** Empty state shown when the user has no past major-draw entries.
 * Glowing red icon tile + acumin headline matches the suite design language. */
const PastDrawsEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
    <div
      className="w-14 h-14 rounded-2xl inline-flex items-center justify-center mb-3"
      style={{
        backgroundColor: "rgba(238,0,0,0.10)",
        border: "1.5px solid rgba(238,0,0,0.30)",
        boxShadow: "0 0 18px rgba(238,0,0,0.18)",
        color: "#dc2626",
      }}
    >
      <Ticket className="w-6 h-6" strokeWidth={2.2} />
    </div>
    <h3 className="font-acumin text-[20px] uppercase text-neutral-900 dark:text-white mb-1.5">
      {EMPTY_TITLE}
    </h3>
    <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-xs leading-relaxed">
      {EMPTY_MESSAGE}
    </p>
  </div>
);

export default PastDrawsEmptyState;
