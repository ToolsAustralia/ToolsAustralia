"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../ui";

interface PastDueAlertProps {
  onResolve: () => void;
  onCancel: () => void;
}

/**
 * Banner shown when the user's subscription has a failed renewal.
 * Renders both "Resolve Payment Issue" and "Cancel Subscription" actions.
 */
const PastDueAlert: React.FC<PastDueAlertProps> = ({ onResolve, onCancel }) => {
  return (
    <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4">
      <div className="flex items-start gap-2 sm:gap-3">
        <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm sm:text-base font-semibold text-red-900 dark:text-red-100 mb-1.5 sm:mb-2">
            Subscription Renewal Failed
          </h4>
          <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mb-3 sm:mb-4">
            Renew your subscription now to keep your benefits active. Don&apos;t lose your accumulated entries and access
            to exclusive features.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              onClick={onResolve}
              variant="primary"
              className="bg-red-600 hover:bg-red-700 text-sm sm:text-base"
              size="sm"
            >
              Resolve Payment Issue
            </Button>
            <Button
              onClick={onCancel}
              variant="outline"
              className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm sm:text-base"
              size="sm"
            >
              Cancel Subscription
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PastDueAlert;
