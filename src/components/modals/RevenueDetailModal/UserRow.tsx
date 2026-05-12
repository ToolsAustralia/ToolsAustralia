"use client";

import React from "react";
import {
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  Package,
} from "lucide-react";
import { format } from "date-fns";
import { formatDisplayName } from "@/utils/display-name";
import type { RevenueDetailUser } from "@/hooks/queries/useAdminQueries";

interface UserRowProps {
  user: RevenueDetailUser;
  isExpanded: boolean;
  onToggleExpanded: (userId: string) => void;
  onUserClick?: (userId: string) => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

const formatDate = (dateString: string) => format(new Date(dateString), "MMM d, yyyy HH:mm");

const UserRow: React.FC<UserRowProps> = ({ user, isExpanded, onToggleExpanded, onUserClick }) => {
  const sortedPurchases = [...user.purchases].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const firstPurchase = sortedPurchases[sortedPurchases.length - 1];

  return (
    <div className="border-2 border-gray-200 dark:border-neutral-600 rounded-lg hover:border-gray-300 dark:hover:border-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800/40 transition-all duration-200">
      {/* User Row */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => onToggleExpanded(user.userId)}
      >
        {/* Mobile View */}
        <div className="lg:hidden space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400 dark:text-neutral-500" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-neutral-100">
                  {formatDisplayName(user.userInfo.firstName, user.userInfo.lastName)}
                </p>
                <p className="text-sm text-gray-600 dark:text-neutral-400">{user.userInfo.email}</p>
              </div>
            </div>
            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-neutral-500" />}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-neutral-400">Purchases:</span>{" "}
              <span className="font-medium text-gray-900 dark:text-neutral-100">{user.purchaseCount}</span>
            </div>
            <div className="text-right">
              <span className="text-gray-500 dark:text-neutral-400">Total:</span>{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(user.totalContributed)}</span>
            </div>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
          <div className="col-span-3">
            <p className="font-semibold text-gray-900 dark:text-neutral-100">
              {formatDisplayName(user.userInfo.firstName, user.userInfo.lastName)}
            </p>
            {user.userInfo.mobile && <p className="text-xs text-gray-500 dark:text-neutral-400">{user.userInfo.mobile}</p>}
          </div>
          <div className="col-span-3 text-sm text-gray-600 dark:text-neutral-400">{user.userInfo.email}</div>
          <div className="col-span-1 text-right font-medium text-gray-900 dark:text-neutral-100">{user.purchaseCount}</div>
          <div className="col-span-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(user.totalContributed)}
          </div>
          <div className="col-span-2 text-sm text-gray-600 dark:text-neutral-400">
            {firstPurchase ? formatDate(firstPurchase.timestamp) : "N/A"}
          </div>
          <div className="col-span-1 text-center">
            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-neutral-500" />}
          </div>
        </div>
      </div>

      {/* Expanded Purchase Details */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Purchase Details ({user.purchases.length})
            </h4>
            {onUserClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUserClick(user.userId);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-red-600 via-[#ff3333] to-red-400 text-white hover:shadow-lg transition-all duration-200"
              >
                <User className="w-4 h-4" />
                View User
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sortedPurchases.map((purchase, idx) => (
              <div
                key={purchase.paymentEventId || idx}
                className="bg-white dark:bg-neutral-900/70 p-3 rounded border border-gray-200 dark:border-neutral-700 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-gray-400 dark:text-neutral-500" />
                    <span className="font-medium text-gray-900 dark:text-neutral-100">
                      {purchase.packageName || purchase.packageId || "Unknown Package"}
                    </span>
                    {purchase.billingReason && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-950/45 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                        {purchase.billingReason === "subscription_cycle" ? "Renewal" : "New"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(purchase.timestamp)}
                    </span>
                    {purchase.packageId && (
                      <span className="text-gray-500 dark:text-neutral-500">ID: {purchase.packageId}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(purchase.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserRow;
