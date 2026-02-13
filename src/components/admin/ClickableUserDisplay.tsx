"use client";

import React from "react";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";

interface ClickableUserDisplayProps {
  displayText: string;
  userId?: string | null;
  subtext?: string;
  className?: string;
}

/**
 * Displays user name/email. When userId is provided, renders as clickable and opens User Detail modal on click.
 * When userId is absent (e.g. guest users), renders as plain text.
 */
export default function ClickableUserDisplay({
  displayText,
  userId,
  subtext,
  className = "",
}: ClickableUserDisplayProps) {
  const { openUserModal } = useAdminUserModal();

  if (userId) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUserModal(userId);
        }}
        className={`text-left text-sm font-medium text-gray-900 hover:text-red-600 hover:underline cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded ${className}`}
      >
        {displayText}
        {subtext && <span className="block text-xs text-gray-500 font-normal">{subtext}</span>}
      </button>
    );
  }

  return (
    <span className={`text-sm text-gray-900 ${className}`}>
      {displayText}
      {subtext && <span className="block text-xs text-gray-500">{subtext}</span>}
    </span>
  );
}
