"use client";

import React, { memo } from "react";
import { LucideIcon } from "lucide-react";

export interface MetricCardProps {
  title: string | React.ReactNode;
  value: string | number;
  subtitle?: string | React.ReactNode;
  icon: LucideIcon;
  color?: "red" | "emerald" | "blue" | "purple" | "yellow" | "indigo" | "orange" | "pink" | "green";
  valueClassName?: string;
  trend?: {
    value: number;
    direction?: "up" | "down" | "neutral";
    isPositive?: boolean; // Legacy support for AdminStatsCard
  };
  loading?: boolean;
  "aria-label"?: string;
  className?: string;
  onClick?: () => void;
  count?: number;
  countLabel?: string;
  clickable?: boolean;
}

export const MetricCard = memo<MetricCardProps>(function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "blue",
  valueClassName,
  trend,
  loading = false,
  "aria-label": ariaLabel,
  className = "",
  onClick,
  count,
  countLabel,
  clickable = false,
}) {
  if (loading) {
    return (
      <div
        className={`bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-2.5 sm:p-4 lg:p-6 animate-pulse ${className}`}
      >
        <div className="h-3 sm:h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/2 mb-1.5 sm:mb-2"></div>
        <div className="h-5 sm:h-7 lg:h-8 bg-gray-200 dark:bg-neutral-700 rounded w-3/4"></div>
        {subtitle && <div className="h-2.5 sm:h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/2 mt-1.5 sm:mt-2"></div>}
      </div>
    );
  }

  // Map "green" to "emerald" for backward compatibility
  const normalizedColor = color === "green" ? "emerald" : color;

  const colorClasses = {
    red: "border-red-100 bg-red-50 dark:border-red-900/45 dark:bg-red-950/25",
    emerald: "border-emerald-100 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/25",
    blue: "border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/25",
    purple: "border-purple-100 bg-purple-50 dark:border-purple-900/40 dark:bg-purple-950/25",
    yellow: "border-yellow-100 bg-yellow-50 dark:border-yellow-900/35 dark:bg-yellow-950/20",
    indigo: "border-indigo-100 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/25",
    orange: "border-orange-100 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/25",
    pink: "border-pink-100 bg-pink-50 dark:border-pink-900/40 dark:bg-pink-950/25",
  };

  const iconColorClasses = {
    red: "text-red-600 dark:text-red-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    purple: "text-purple-600 dark:text-purple-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    orange: "text-orange-600 dark:text-orange-400",
    pink: "text-pink-600 dark:text-pink-400",
  };

  // Determine trend direction from either format
  const trendDirection = trend
    ? trend.direction !== undefined
      ? trend.direction
      : trend.isPositive !== undefined
      ? trend.isPositive
        ? "up"
        : "down"
      : "neutral"
    : undefined;

  const titleString = typeof title === "string" ? title : "";
  const displayValue = typeof value === "number" ? value.toLocaleString() : value;
  const isClickable = clickable || !!onClick;

  return (
    <div
      className={`bg-white dark:bg-neutral-900/90 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border ${colorClasses[normalizedColor]} p-2.5 sm:p-4 lg:p-6 ${
        isClickable
          ? "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-neutral-600"
          : ""
      } ${className}`}
      aria-label={ariaLabel || `${titleString}: ${displayValue}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1 sm:mb-2">
        {typeof title === "string" ? (
          <h3 className="text-2xs leading-tight sm:text-sm font-medium text-gray-500 dark:text-neutral-400 pr-1">
            {title}
          </h3>
        ) : (
          <div className="text-2xs leading-tight sm:text-sm font-medium text-gray-500 dark:text-neutral-400 pr-1">
            {title}
          </div>
        )}
        <div className={`shrink-0 p-1.5 sm:p-2 rounded-md sm:rounded-lg ring-1 ring-black/5 dark:ring-white/10 shadow-sm ${colorClasses[normalizedColor]}`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColorClasses[normalizedColor]}`} aria-hidden="true" />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-1.5 min-w-0">
        <p
          className={
            valueClassName ??
            "text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tabular-nums tracking-tight break-words"
          }
        >
          {displayValue}
        </p>
        {trend && trendDirection && (
          <div
            className={`shrink-0 text-2xs sm:text-xs font-semibold ${
              trendDirection === "up"
                ? "text-emerald-600"
                : trendDirection === "down"
                ? "text-red-600"
                : "text-gray-600 dark:text-neutral-400"
            }`}
          >
            {trendDirection === "up" ? "↑" : trendDirection === "down" ? "↓" : "→"} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      {count !== undefined && count !== null && (
        <div className="text-2xs sm:text-xs font-medium text-gray-600 dark:text-neutral-400 mt-0.5 sm:mt-1">
          {count.toLocaleString()} {countLabel || "items"}
        </div>
      )}
      {subtitle && (
        <div
          className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 mt-0.5 sm:mt-1 leading-snug"
          aria-label={`${titleString} subtitle`}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
});

MetricCard.displayName = "MetricCard";

