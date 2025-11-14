"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface UserStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo" | "emerald";
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

/**
 * Reusable stats card component for displaying user metrics
 * Used in user detail modals and admin dashboard
 */
export default function UserStatsCard({
  title,
  value,
  icon: Icon,
  subtitle,
  color = "blue",
  trend,
  className = "",
}: UserStatsCardProps) {
  // Color configurations for different themes
  const colorConfig = {
    blue: {
      bg: "from-blue-500 to-blue-600",
      hover: "hover:from-blue-600 hover:to-blue-700",
      icon: "text-blue-600",
      iconBg: "bg-blue-100",
    },
    green: {
      bg: "from-green-500 to-green-600",
      hover: "hover:from-green-600 hover:to-green-700",
      icon: "text-green-600",
      iconBg: "bg-green-100",
    },
    yellow: {
      bg: "from-yellow-500 to-yellow-600",
      hover: "hover:from-yellow-600 hover:to-yellow-700",
      icon: "text-yellow-600",
      iconBg: "bg-yellow-100",
    },
    red: {
      bg: "from-red-500 to-red-600",
      hover: "hover:from-red-600 hover:to-red-700",
      icon: "text-red-600",
      iconBg: "bg-red-100",
    },
    purple: {
      bg: "from-purple-500 to-purple-600",
      hover: "hover:from-purple-600 hover:to-purple-700",
      icon: "text-purple-600",
      iconBg: "bg-purple-100",
    },
    indigo: {
      bg: "from-indigo-500 to-indigo-600",
      hover: "hover:from-indigo-600 hover:to-indigo-700",
      icon: "text-indigo-600",
      iconBg: "bg-indigo-100",
    },
    emerald: {
      bg: "from-emerald-500 to-emerald-600",
      hover: "hover:from-emerald-600 hover:to-emerald-700",
      icon: "text-emerald-600",
      iconBg: "bg-emerald-100",
    },
  };

  const config = colorConfig[color];

  return (
    <div
      className={`bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6 transition-all duration-200 hover:shadow-xl ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 ${config.iconBg} rounded-lg flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${config.icon}`} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">{title}</h3>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">
              {typeof value === "number" ? value.toLocaleString() : value}
            </span>
            
            {trend && (
              <span
                className={`text-sm font-medium flex items-center gap-1 ${
                  trend.isPositive ? "text-green-600" : "text-red-600"
                }`}
              >
                <span className={trend.isPositive ? "↗" : "↘"}>
                  {trend.isPositive ? "↗" : "↘"}
                </span>
                {Math.abs(trend.value)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for smaller spaces
 */
export function UserStatsCardCompact({
  title,
  value,
  icon: Icon,
  color = "blue",
  className = "",
}: Omit<UserStatsCardProps, "subtitle" | "trend">) {
  const colorConfig = {
    blue: {
      icon: "text-blue-600",
      iconBg: "bg-blue-100",
    },
    green: {
      icon: "text-green-600",
      iconBg: "bg-green-100",
    },
    yellow: {
      icon: "text-yellow-600",
      iconBg: "bg-yellow-100",
    },
    red: {
      icon: "text-red-600",
      iconBg: "bg-red-100",
    },
    purple: {
      icon: "text-purple-600",
      iconBg: "bg-purple-100",
    },
    indigo: {
      icon: "text-indigo-600",
      iconBg: "bg-indigo-100",
    },
    emerald: {
      icon: "text-emerald-600",
      iconBg: "bg-emerald-100",
    },
  };

  const config = colorConfig[color];

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-100 p-3 transition-all duration-200 hover:shadow-md ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 ${config.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${config.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-600 truncate">{title}</p>
          <p className="text-lg font-bold text-gray-900">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  );
}
