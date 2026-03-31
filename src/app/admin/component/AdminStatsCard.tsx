"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface AdminStatsCardProps {
  title: string | React.ReactNode;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "red" | "green" | "blue" | "yellow" | "purple" | "indigo" | "pink" | "emerald" | "orange";
  className?: string;
  subtitle?: string;
  loading?: boolean;
}

export default function AdminStatsCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "red",
  className = "",
  subtitle,
  loading = false,
}: AdminStatsCardProps) {
  const colorClasses = {
    red: {
      bg: "bg-gradient-to-br from-red-500 via-red-600 to-red-700",
      bgLight: "bg-red-50",
      text: "text-red-600",
      icon: "text-white",
      iconBg: "bg-red-100",
    },
    green: {
      bg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600",
      bgLight: "bg-emerald-50",
      text: "text-emerald-600",
      icon: "text-white",
      iconBg: "bg-emerald-100",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600",
      bgLight: "bg-blue-50",
      text: "text-blue-600",
      icon: "text-white",
      iconBg: "bg-blue-100",
    },
    yellow: {
      bg: "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600",
      bgLight: "bg-yellow-50",
      text: "text-yellow-600",
      icon: "text-white",
      iconBg: "bg-yellow-100",
    },
    purple: {
      bg: "bg-gradient-to-br from-purple-500 via-purple-600 to-violet-600",
      bgLight: "bg-purple-50",
      text: "text-purple-600",
      icon: "text-white",
      iconBg: "bg-purple-100",
    },
    indigo: {
      bg: "bg-gradient-to-br from-indigo-500 via-indigo-600 to-blue-600",
      bgLight: "bg-indigo-50",
      text: "text-indigo-600",
      icon: "text-white",
      iconBg: "bg-indigo-100",
    },
    pink: {
      bg: "bg-gradient-to-br from-pink-500 via-pink-600 to-rose-600",
      bgLight: "bg-pink-50",
      text: "text-pink-600",
      icon: "text-white",
      iconBg: "bg-pink-100",
    },
    emerald: {
      bg: "bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-500",
      bgLight: "bg-emerald-50",
      text: "text-emerald-600",
      icon: "text-white",
      iconBg: "bg-emerald-100",
    },
    orange: {
      bg: "bg-gradient-to-br from-orange-500 via-orange-600 to-red-600",
      bgLight: "bg-orange-50",
      text: "text-orange-600",
      icon: "text-white",
      iconBg: "bg-orange-100",
    },
  };

  const selectedColor = colorClasses[color];

  if (loading) {
    return (
      <div
        className={`bg-white dark:bg-neutral-900 rounded-xl shadow-sm dark:shadow-none border border-gray-100 dark:border-neutral-700 overflow-hidden ${className}`}
      >
        <div className="p-4">
          <div className="animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/2"></div>
              <div className="w-10 h-10 bg-gray-200 dark:bg-neutral-700 rounded-lg"></div>
            </div>
            <div className="h-6 bg-gray-200 dark:bg-neutral-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/3"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl shadow-lg dark:shadow-none border-2 border-slate-200/50 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 hover:shadow-xl transition-all duration-300 overflow-hidden group bg-gradient-to-br from-white via-slate-50 to-white dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 ${className}`}
    >
      {/* Gradient overlay on hover */}
      <div
        className={`absolute inset-0 ${selectedColor.bg} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
      ></div>

      <div className="relative p-2.5 sm:p-4 lg:p-5">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="flex-1 min-w-0">
            {typeof title === "string" ? (
              <p className="text-slate-600 dark:text-neutral-400 font-semibold text-[10px] sm:text-xs lg:text-sm mb-0.5 sm:mb-1 truncate uppercase tracking-wide">
                {title}
              </p>
            ) : (
              <div className="text-slate-600 dark:text-neutral-400 font-semibold text-[10px] sm:text-xs lg:text-sm mb-0.5 sm:mb-1 uppercase tracking-wide">
                {title}
              </div>
            )}
            {subtitle && (
              <p className="hidden sm:block text-[9px] sm:text-xs text-slate-500 dark:text-neutral-500 font-medium mb-1 sm:mb-2 leading-tight">
                {subtitle}
              </p>
            )}
          </div>
          <div
            className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 ${selectedColor.bg} rounded-xl sm:rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg flex-shrink-0`}
          >
            <Icon className={`w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 ${selectedColor.icon}`} />
          </div>
        </div>

        <div className="space-y-1 sm:space-y-2">
          <p className="text-xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>

          {trend && (
            <div
              className={`flex items-center gap-1 text-[10px] sm:text-xs lg:text-sm font-semibold ${
                trend.isPositive ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              ) : (
                <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
              )}
              <span>
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-slate-500 dark:text-neutral-400 text-[9px] sm:text-xs ml-1 font-normal hidden sm:inline">
                vs last period
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom gradient accent bar */}
      <div
        className={`h-1.5 ${selectedColor.bg} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
      ></div>
    </div>
  );
}
