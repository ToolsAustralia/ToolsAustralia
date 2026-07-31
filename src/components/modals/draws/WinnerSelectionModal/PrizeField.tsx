"use client";

import React from "react";
import { Gift } from "lucide-react";

interface PrizeFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const PrizeField: React.FC<PrizeFieldProps> = ({ value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        Selected Prize (Optional)
      </div>
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="e.g., $10,000 Cash, Milwaukee + Sidchrome, DeWalt + Sidchrome, etc."
      className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 font-['Inter'] bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 transition-all duration-200"
    />
    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
      Enter the prize selected by the winner. This will be displayed on the winners page. You can enter any prize description (e.g., &quot;$15,000 Cash&quot;, &quot;Milwaukee + Sidchrome Tool Set&quot;, etc.). You can set this now or update it later.
    </p>
  </div>
);

export default PrizeField;
