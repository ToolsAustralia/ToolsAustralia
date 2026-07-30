"use client";

import React from "react";
import { Link2 } from "lucide-react";

interface DrawResultLinkFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const DrawResultLinkField: React.FC<DrawResultLinkFieldProps> = ({ value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        Draw result link (optional)
      </div>
    </label>
    <input
      type="url"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://randomdraws.com.au/..."
      className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 font-['Inter'] bg-white dark:bg-neutral-900 text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 transition-all duration-200"
    />
    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
      If set, the public draw results page can send visitors to your Random Draws (or other) verification URL.
      Leave empty for no link. For major draws, clearing this field when re-recording a winner removes the
      stored link.
    </p>
  </div>
);

export default DrawResultLinkField;
