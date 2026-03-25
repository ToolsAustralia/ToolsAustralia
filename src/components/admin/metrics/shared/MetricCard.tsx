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
      <div className={`bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 p-2.5 sm:p-4 lg:p-6 animate-pulse ${className}`}>
        <div className="h-3 sm:h-4 bg-gray-200 rounded w-1/2 mb-1.5 sm:mb-2"></div>
        <div className="h-5 sm:h-7 lg:h-8 bg-gray-200 rounded w-3/4"></div>
        {subtitle && <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-1/2 mt-1.5 sm:mt-2"></div>}
      </div>
    );
  }

  // Map "green" to "emerald" for backward compatibility
  const normalizedColor = color === "green" ? "emerald" : color;

  const colorClasses = {
    red: "border-red-100 bg-red-50",
    emerald: "border-emerald-100 bg-emerald-50",
    blue: "border-blue-100 bg-blue-50",
    purple: "border-purple-100 bg-purple-50",
    yellow: "border-yellow-100 bg-yellow-50",
    indigo: "border-indigo-100 bg-indigo-50",
    orange: "border-orange-100 bg-orange-50",
    pink: "border-pink-100 bg-pink-50",
  };

  const iconColorClasses = {
    red: "text-red-600",
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
    yellow: "text-yellow-600",
    indigo: "text-indigo-600",
    orange: "text-orange-600",
    pink: "text-pink-600",
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
      className={`bg-white rounded-lg sm:rounded-xl shadow-sm border ${colorClasses[normalizedColor]} p-2.5 sm:p-4 lg:p-6 ${
        isClickable ? "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300" : ""
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
          <h3 className="text-[11px] leading-tight sm:text-sm font-medium text-gray-500 pr-1">{title}</h3>
        ) : (
          <div className="text-[11px] leading-tight sm:text-sm font-medium text-gray-500 pr-1">{title}</div>
        )}
        <div className={`shrink-0 p-1.5 sm:p-2 ${colorClasses[normalizedColor]} rounded-md sm:rounded-lg`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColorClasses[normalizedColor]}`} aria-hidden="true" />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-1.5 min-w-0">
        <p
          className={
            valueClassName ??
            "text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 tabular-nums tracking-tight break-words"
          }
        >
          {displayValue}
        </p>
        {trend && trendDirection && (
          <div
            className={`shrink-0 text-[10px] sm:text-xs font-semibold ${
              trendDirection === "up"
                ? "text-emerald-600"
                : trendDirection === "down"
                ? "text-red-600"
                : "text-gray-600"
            }`}
          >
            {trendDirection === "up" ? "↑" : trendDirection === "down" ? "↓" : "→"} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      {count !== undefined && count !== null && (
        <div className="text-[11px] sm:text-xs font-medium text-gray-600 mt-0.5 sm:mt-1">
          {count.toLocaleString()} {countLabel || "items"}
        </div>
      )}
      {subtitle && (
        <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 leading-snug" aria-label={`${titleString} subtitle`}>
          {subtitle}
        </div>
      )}
    </div>
  );
});

MetricCard.displayName = "MetricCard";

