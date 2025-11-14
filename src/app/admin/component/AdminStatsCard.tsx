"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface AdminStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "red" | "green" | "blue" | "yellow" | "purple" | "indigo" | "pink" | "emerald";
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
      bg: "bg-gradient-to-br from-red-500 to-red-600",
      bgLight: "bg-red-50",
      text: "text-red-600",
      icon: "text-white",
      iconBg: "bg-red-100",
    },
    green: {
      bg: "bg-gradient-to-br from-green-500 to-green-600",
      bgLight: "bg-green-50",
      text: "text-green-600",
      icon: "text-white",
      iconBg: "bg-green-100",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-500 to-blue-600",
      bgLight: "bg-blue-50",
      text: "text-blue-600",
      icon: "text-white",
      iconBg: "bg-blue-100",
    },
    yellow: {
      bg: "bg-gradient-to-br from-yellow-500 to-yellow-600",
      bgLight: "bg-yellow-50",
      text: "text-yellow-600",
      icon: "text-white",
      iconBg: "bg-yellow-100",
    },
    purple: {
      bg: "bg-gradient-to-br from-purple-500 to-purple-600",
      bgLight: "bg-purple-50",
      text: "text-purple-600",
      icon: "text-white",
      iconBg: "bg-purple-100",
    },
    indigo: {
      bg: "bg-gradient-to-br from-indigo-500 to-indigo-600",
      bgLight: "bg-indigo-50",
      text: "text-indigo-600",
      icon: "text-white",
      iconBg: "bg-indigo-100",
    },
    pink: {
      bg: "bg-gradient-to-br from-pink-500 to-pink-600",
      bgLight: "bg-pink-50",
      text: "text-pink-600",
      icon: "text-white",
      iconBg: "bg-pink-100",
    },
    emerald: {
      bg: "bg-gradient-to-br from-emerald-500 to-emerald-600",
      bgLight: "bg-emerald-50",
      text: "text-emerald-600",
      icon: "text-white",
      iconBg: "bg-emerald-100",
    },
  };

  const selectedColor = colorClasses[color];

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
        <div className="p-4">
          <div className="animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-300 overflow-hidden group ${className}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-gray-600 font-medium text-sm mb-1 truncate">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 mb-2">{subtitle}</p>}
          </div>
          <div
            className={`w-10 h-10 ${selectedColor.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}
          >
            <Icon className={`w-5 h-5 ${selectedColor.text}`} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 leading-none">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>

          {trend && (
            <div
              className={`flex items-center gap-1 text-sm font-medium ${
                trend.isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {trend.isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-gray-500 text-xs ml-1">vs last period</span>
            </div>
          )}
        </div>
      </div>

      {/* Subtle gradient accent */}
      <div
        className={`h-1 ${selectedColor.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      ></div>
    </div>
  );
}
