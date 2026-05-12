"use client";

import React from "react";
import { CheckCircle } from "lucide-react";

const TrustIndicators: React.FC = () => {
  return (
    <div className="mt-2 border-t border-gray-200 pt-2 dark:border-neutral-700 sm:mt-4 sm:pt-4">
      <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-neutral-400 sm:gap-6 sm:text-sm">
        <div className="flex items-center gap-1 sm:gap-2">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>Instant</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>Secure</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>One-Time Payment</span>
        </div>
      </div>
    </div>
  );
};

export default TrustIndicators;
