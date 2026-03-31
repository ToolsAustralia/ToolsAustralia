"use client";

import React from "react";
import { Ticket } from "lucide-react";

const EMPTY_TITLE = "No Past Draw Entries";
const EMPTY_MESSAGE =
  "You haven't participated in any completed major draws yet. Enter the current draw to see your history here!";

const PastDrawsEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
      <Ticket className="w-8 h-8 text-gray-400 dark:text-neutral-500" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-2">{EMPTY_TITLE}</h3>
    <p className="text-sm text-gray-500 dark:text-neutral-400 max-w-xs">{EMPTY_MESSAGE}</p>
  </div>
);

export default PastDrawsEmptyState;
