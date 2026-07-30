"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

const ReplaceWarning: React.FC = () => (
  <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-200 dark:border-yellow-800/50 rounded-lg">
    <div className="flex items-center gap-2 mb-2">
      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
      <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Current Winner Exists</span>
    </div>
    <p className="text-sm text-yellow-700 dark:text-yellow-300">
      There is already a winner selected for this draw. Selecting a new winner will replace the current one.
    </p>
  </div>
);

export default ReplaceWarning;
