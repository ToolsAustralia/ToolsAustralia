"use client";

import React from "react";
import MembershipBadge from "@/components/ui/MembershipBadge";
import { formatDisplayName } from "@/utils/display-name";

interface UserInfoBarProps {
  firstName: string;
  lastName: string;
  email: string;
  membershipPackage?: {
    _id?: string;
    name: string;
    type?: "subscription" | "one-time";
  } | null;
  hasActiveSubscription?: boolean;
  className?: string;
}

export default function UserInfoBar({
  firstName,
  lastName,
  email,
  membershipPackage,
  hasActiveSubscription = false,
  className = "",
}: UserInfoBarProps) {
  return (
    <div className={`px-4 sm:px-6 pt-12 xs:pt-14 sm:pt-16 pb-4 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-row items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl xs:text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              {formatDisplayName(firstName, lastName)}
            </h2>
            <p className="text-xs xs:text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 truncate">
              {email}
            </p>
          </div>

          {membershipPackage && hasActiveSubscription && (
            <div className="flex items-center flex-shrink-0 ml-2">
              <MembershipBadge
                packageData={membershipPackage}
                isActive={true}
                membershipType="subscription"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
