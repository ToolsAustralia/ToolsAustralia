/**
 * User Row Component
 * Displays a single user row in the users table
 */

import React from "react";
import Image from "next/image";
import { Trophy, Gift, Clock, Eye, Mail, Key, CheckCircle, AlertTriangle } from "lucide-react";
import type { AdminUserListItem } from "@/types/admin";
import {
  formatCurrency,
  formatDate,
  getPackageIconImage,
  getPackageColorScheme,
  getGradientColor,
} from "../utils/userHelpers";
import { getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { derivePlanIdFromPackage } from "@/utils/package-colors/packageColorScheme";
import { renderAdminSubscriptionBadge } from "@/components/admin/ui/AdminBadge";
import { formatDisplayName } from "@/utils/display-name";
import defaultLogo from "../../../../public/images/Tools Australia Logo/Social Media Profile_Black Background.webp";

interface UserRowProps {
  user: AdminUserListItem;
  onUserClick: (user: AdminUserListItem) => void;
  onQuickAction: (action: string, userId: string) => void;
}

/**
 * Single user row component for the users table
 */
export default function UserRow({ user, onUserClick, onQuickAction }: UserRowProps) {
  const packageIcon = getPackageIconImage(user.subscription?.packageName);
  const packageIconScaleClass = getPackageIconWrapperScaleClass(
    derivePlanIdFromPackage(
      { name: user.subscription?.packageName ?? "", type: "subscription" },
      "subscription"
    ),
    "badge"
  );
  const colorScheme = getPackageColorScheme(user.subscription?.packageName);
  const hasActiveSubscription = user.subscription?.isActive;
  const borderGradientColor = colorScheme ? getGradientColor(colorScheme.gradient) : "#6b7280";
  const isPremiumPackage =
    user.subscription?.packageName?.toLowerCase().includes("boss") ||
    user.subscription?.packageName?.toLowerCase().includes("power");

  return (
    <tr
      className="hover:bg-gray-50 cursor-pointer transition-colors even:bg-gray-50/30"
      onClick={() => onUserClick(user)}
    >
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
        <div className="flex items-center">
          {/* User Avatar - Logo or Package Icon */}
          {hasActiveSubscription && packageIcon ? (
            <span
              className={`inline-flex items-center justify-center rounded-full shadow-lg relative overflow-hidden flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 ${
                isPremiumPackage ? "animate-pulse" : ""
              }`}
              style={{
                border: `2px solid transparent`,
                backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${borderGradientColor}, transparent)`,
                backgroundOrigin: `border-box`,
                backgroundClip: `padding-box, border-box`,
                padding: "2px",
              }}
            >
              <div
                className={`relative w-full h-full flex-shrink-0 flex items-center justify-center ${packageIconScaleClass}`}
              >
                <Image
                  src={packageIcon}
                  alt={user.subscription?.packageName || "Package"}
                  className="w-5 h-5 sm:w-7 sm:h-7 lg:w-9 lg:h-9 object-contain"
                  width={36}
                  height={36}
                />
              </div>
            </span>
          ) : (
            <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
              <Image
                src={defaultLogo}
                alt="Tools Australia"
                className="w-full h-full object-cover"
                width={48}
                height={48}
              />
            </div>
          )}
          <div className="ml-2 sm:ml-3 lg:ml-4 min-w-0 flex-1">
            <div className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 truncate">
              {formatDisplayName(user.firstName, user.lastName)}
            </div>
            <div className="text-3xs sm:text-xs lg:text-sm text-gray-500 truncate">{user.email}</div>
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 mt-0.5 sm:mt-1">
              {user.isEmailVerified ? (
                <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-green-500 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
              )}
              {user.role === "admin" && (
                <span className="text-3xs sm:text-2xs lg:text-xs text-gray-500 font-medium">Admin</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
        {renderAdminSubscriptionBadge(user)}
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-2xs sm:text-xs lg:text-sm font-medium text-gray-900 dark:text-white tabular-nums">
        {formatCurrency(user.totalSpent)}
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap hidden md:table-cell">
        <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
          <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-yellow-500 flex-shrink-0" />
          <span className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
            {user.majorDrawEntries}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap">
        <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
          <Gift className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 text-purple-500 flex-shrink-0" />
          <span className="text-2xs sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
            {user.miniDrawCount || 0}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-2xs sm:text-xs lg:text-sm text-gray-500">
        {user.lastLogin ? (
          <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2">
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 flex-shrink-0" />
            <span className="truncate">{formatDate(user.lastLogin)}</span>
          </div>
        ) : (
          <span className="text-gray-400">Never</span>
        )}
      </td>
      <td className="px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 lg:py-4 whitespace-nowrap text-2xs sm:text-xs lg:text-sm font-medium">
        <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUserClick(user);
            }}
            className="text-red-600 hover:text-red-700 transition-colors p-1 sm:p-1.5 hover:bg-red-50 rounded"
            title="View Details"
          >
            <Eye className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAction("resend_verification", user.id);
            }}
            className="text-blue-600 hover:text-blue-700 transition-colors p-1 sm:p-1.5 hover:bg-blue-50 rounded"
            title="Resend Verification"
          >
            <Mail className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAction("reset_password", user.id);
            }}
            className="text-yellow-600 hover:text-yellow-700 transition-colors p-1 sm:p-1.5 hover:bg-yellow-50 rounded"
            title="Reset Password"
          >
            <Key className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
          </button>
        </div>
      </td>
    </tr>
  );
}





