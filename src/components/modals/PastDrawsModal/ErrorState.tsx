"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  /** Click handler for the inline retry link. */
  onRetry: () => void;
}

/** Error card shown when usePastDrawsData fails. Dark-mode aware. */
const ErrorState: React.FC<ErrorStateProps> = ({ onRetry }) => (
  <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-300" />
      </div>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-red-800 dark:text-red-200">
          Something went wrong loading your draw history.
        </p>
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          Please try again or contact support if the problem continues.{" "}
          <button
            onClick={onRetry}
            className="font-semibold text-red-600 dark:text-red-300 underline underline-offset-2 hover:text-red-500 dark:hover:text-red-200 transition-colors"
            type="button"
          >
            Retry now
          </button>
        </p>
      </div>
    </div>
  </div>
);

export default ErrorState;
