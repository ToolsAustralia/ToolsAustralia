"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface DashboardSectionProps {
  title?: string;
  subtitle?: string;
  /** Renders on the right side of the title row (e.g. Sync button), before optional `action` / collapsible chevron */
  headerTrailing?: React.ReactNode;
  children: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  collapsible?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

export default function DashboardSection({
  title,
  subtitle,
  headerTrailing,
  children,
  action,
  collapsible = false,
  isExpanded = true,
  onToggleExpand,
  className = "",
  headerClassName = "",
  contentClassName = "",
  noPadding = false,
}: DashboardSectionProps) {
  const ActionIcon = action?.icon;

  return (
    <div className={`bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {(title || action || collapsible || headerTrailing) && (
        <div
          className={`flex flex-wrap items-start sm:items-center justify-between gap-2 ${noPadding ? "p-3 sm:p-4 lg:p-5" : "px-3 sm:px-4 lg:px-5 pt-3 sm:pt-4 lg:pt-5 pb-2 sm:pb-3"} ${
            collapsible ? "cursor-pointer" : ""
          } ${headerClassName}`}
          onClick={collapsible ? onToggleExpand : undefined}
        >
          <div className="flex-1 min-w-0">
            {title && <h3 className="text-sm sm:text-base font-semibold text-gray-900 leading-snug">{title}</h3>}
            {subtitle && <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 leading-snug">{subtitle}</p>}
          </div>
          {headerTrailing && <div className="shrink-0 ml-auto sm:ml-0">{headerTrailing}</div>}
          {action && !collapsible && (
            <button
              onClick={action.onClick}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              {ActionIcon && <ActionIcon className="w-4 h-4" />}
              {action.label}
            </button>
          )}
          {collapsible && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
              aria-label={isExpanded ? "Collapse section" : "Expand section"}
            >
              <svg
                className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 transition-transform ${isExpanded ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
      {isExpanded && (
        <div className={noPadding ? contentClassName : `px-3 sm:px-4 lg:px-5 pb-3 sm:pb-4 lg:pb-5 ${contentClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
}
