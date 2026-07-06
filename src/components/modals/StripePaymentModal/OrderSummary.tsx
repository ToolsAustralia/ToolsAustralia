"use client";

import React from "react";
import Card from "@/components/ui/Card";

interface OrderSummaryProps {
  packageName: string;
  amount: number;
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: {
      currentBillingDate: string;
      nextBillingDate: string;
      nextBillingAmount: number;
      billingDateStays: boolean;
    };
  };
}

const OrderSummary: React.FC<OrderSummaryProps> = ({ packageName, amount, upgradeInfo }) => {
  if (upgradeInfo) {
    return (
      <Card padding="none" className="mb-4">
        <Card.Header className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Order Summary</span>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Upgrade</span>
          </div>
        </Card.Header>
        <Card.Body className="px-4 pb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Current plan</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {upgradeInfo.fromPackage.name} (${upgradeInfo.fromPackage.price}/mo)
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Upgrading to</span>
            <span className="font-bold text-neutral-900 dark:text-white">
              {upgradeInfo.toPackage.name} (${upgradeInfo.toPackage.price}/mo)
            </span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-neutral-100 dark:border-neutral-700">
            <span className="text-neutral-600 dark:text-neutral-300 font-medium">Charge today</span>
            <span className="font-bold text-neutral-900 dark:text-white">${(amount / 100).toFixed(2)} AUD</span>
          </div>

          {upgradeInfo.billingInfo && (
            <div className="mt-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-700 p-3 text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Next billing date</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-200">{upgradeInfo.billingInfo.nextBillingDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Next billing amount</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-200">${upgradeInfo.billingInfo.nextBillingAmount}/mo</span>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card padding="none" className="mb-4">
      <Card.Header className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Order Summary</span>
        </div>
      </Card.Header>
      <Card.Body className="px-4 pb-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Upgrading to</span>
          <span className="font-bold text-neutral-900 dark:text-white">{packageName}</span>
        </div>
        <div className="flex items-center justify-between text-sm pt-2 border-t border-neutral-100 dark:border-neutral-700">
          <span className="text-neutral-600 dark:text-neutral-300 font-medium">Amount due</span>
          <span className="text-lg font-bold text-neutral-900 dark:text-white">${(amount / 100).toFixed(2)} AUD</span>
        </div>
      </Card.Body>
    </Card>
  );
};

export default OrderSummary;
