"use client";

import React from "react";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";

interface ClickableUserDisplayProps {
  displayText: string;
  userId?: string | null;
  subtext?: string;
  className?: string;
}

/**
 * Displays user name/email. When userId is provided AND the viewer holds `users.viewDetail`,
 * renders as clickable and opens the User Detail modal on click. Otherwise renders as plain text.
 *
 * This component is the modal's OTHER entry point — it appears on the overview, promo analytics,
 * affiliates and draw surfaces, so gating only the users table would leave the modal reachable
 * from half a dozen other places. Presentation only; the endpoints enforce the same permission.
 */
export default function ClickableUserDisplay({
  displayText,
  userId,
  subtext,
  className = "",
}: ClickableUserDisplayProps) {
  const { openUserModal } = useAdminUserModal();
  const { has } = usePermissions();

  // When callers pass text size (e.g. text-2xs sm:text-xs), use it as the full typography
  // token set — do not merge a default text-sm or Tailwind may pick the wrong winner.
  const typographyClasses = className.trim()
    ? className
    : "text-sm font-medium text-gray-900 dark:text-gray-100";

  // Dark-aware base colour so callers that pass size-only classNames (or a
  // light-only colour) still get a readable text colour in dark mode. twMerge
  // lets an explicit caller colour win for the same variant while keeping the
  // `dark:` fallback.
  const baseTextColor = "text-gray-900 dark:text-gray-100";

  if (userId && has("users.viewDetail")) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUserModal(userId);
        }}
        className={cn(`text-left font-medium ${baseTextColor} hover:text-red-600 hover:underline cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded`, typographyClasses)}
      >
        {displayText}
        {subtext && <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal">{subtext}</span>}
      </button>
    );
  }

  return (
    <span className={cn(baseTextColor, typographyClasses)}>
      {displayText}
      {subtext && <span className="block text-xs text-gray-500 dark:text-gray-400">{subtext}</span>}
    </span>
  );
}
