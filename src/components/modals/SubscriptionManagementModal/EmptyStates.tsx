"use client";

import React from "react";
import { CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "../ui";
import type { SubMgmtUser } from "./types";

interface OneTimeOnlyStateProps {
  packageDisplayName: string;
  onSubscribeClick: () => void;
}

/**
 * Empty-state card shown when the user only owns a one-time package
 * (no active subscription). Mirrors the original branch byte-for-byte.
 */
export const OneTimeOnlyState: React.FC<OneTimeOnlyStateProps> = ({ packageDisplayName, onSubscribeClick }) => (
  <div className="text-center py-8">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
        <CreditCard className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">One-Time Package</h2>
      <p className="text-gray-600 dark:text-neutral-300 mb-4">
        You have an active one-time package: <strong>{packageDisplayName}</strong>
      </p>
      <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
        One-time packages don&apos;t require subscription management. You can purchase additional packages anytime.
      </p>
      <Button
        onClick={onSubscribeClick}
        variant="primary"
        className="bg-gradient-to-r from-red-600 to-red-400 hover:from-red-675 hover:to-red-650 shadow-md hover:shadow-lg transition-all"
      >
        Subscribe to Membership Packages
      </Button>
    </div>
  </div>
);

interface InactiveSubscriptionStateProps {
  status: NonNullable<SubMgmtUser["subscription"]>["status"];
  onSubscribeClick: () => void;
}

/**
 * Empty-state card shown when the user has a subscription record but it
 * is inactive and not past_due (e.g. cancelled, expired).
 */
export const InactiveSubscriptionState: React.FC<InactiveSubscriptionStateProps> = ({ status, onSubscribeClick }) => (
  <div className="text-center py-8">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
        <AlertTriangle className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        {status === "canceled" ? "Subscription Cancelled" : "Subscription Inactive"}
      </h2>
      <p className="text-gray-600 dark:text-neutral-300 mb-6">
        {status === "canceled"
          ? "Your subscription has been cancelled. You can reactivate it anytime."
          : "Your subscription is currently inactive."}
      </p>
      <Button
        onClick={onSubscribeClick}
        variant="primary"
        className="bg-gradient-to-r from-red-600 to-red-400 hover:from-red-675 hover:to-red-650 shadow-md hover:shadow-lg transition-all"
      >
        {status === "canceled" ? "Reactivate Subscription" : "Subscribe to Membership Packages"}
      </Button>
    </div>
  </div>
);

interface NoSubscriptionStateProps {
  onSubscribeClick: () => void;
}

/**
 * Empty-state card shown when the user has no subscription history at all.
 */
export const NoSubscriptionState: React.FC<NoSubscriptionStateProps> = ({ onSubscribeClick }) => (
  <div className="text-center py-8">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
        <CreditCard className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Subscription</h2>
      <p className="text-gray-600 dark:text-neutral-300 mb-6">
        You don&apos;t have an active subscription to manage.
      </p>
      <Button
        onClick={onSubscribeClick}
        variant="primary"
        className="bg-gradient-to-r from-red-600 to-red-400 hover:from-red-675 hover:to-red-650 shadow-md hover:shadow-lg transition-all"
      >
        Subscribe to Membership Packages
      </Button>
    </div>
  </div>
);
