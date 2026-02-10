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
      <div className={`bg-white rounded-xl shadow-lg border-2 border-gray-100 p-3 sm:p-4 lg:p-6 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        {subtitle && <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>}
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
      className={`bg-white rounded-xl shadow-lg border-2 ${colorClasses[normalizedColor]} p-3 sm:p-4 lg:p-6 ${
        isClickable ? "cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-[1.02]" : ""
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
      <div className="flex items-center justify-between mb-2">
        {typeof title === "string" ? (
          <h3 className="text-xs sm:text-sm font-semibold text-gray-600">{title}</h3>
        ) : (
          <div className="text-xs sm:text-sm font-semibold text-gray-600">{title}</div>
        )}
        <div className={`p-1.5 sm:p-2 ${colorClasses[normalizedColor]} rounded-lg`}>
          <Icon className={`w-3 h-3 sm:w-4 sm:h-4 ${iconColorClasses[normalizedColor]}`} aria-hidden="true" />
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <p className={valueClassName ?? "text-xl sm:text-2xl font-bold text-gray-900"}>{displayValue}</p>
        {trend && trendDirection && (
          <div
            className={`text-xs font-semibold ${
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
        <div className="text-xs font-medium text-gray-600 mt-1">
          {count.toLocaleString()} {countLabel || "items"}
        </div>
      )}
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1" aria-label={`${titleString} subtitle`}>
          {subtitle}
        </div>
      )}
      {isClickable && (
        <div className="text-xs text-gray-400 mt-2 italic">Click to view details</div>
      )}
    </div>
  );
});

MetricCard.displayName = "MetricCard";

