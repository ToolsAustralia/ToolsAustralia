"use client";

import React from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

export interface TrendIndicatorProps {
  value: number;
  direction: "up" | "down" | "neutral";
  showIcon?: boolean;
  className?: string;
}

export function TrendIndicator({ value, direction, showIcon = true, className = "" }: TrendIndicatorProps) {
  const colorClass =
    direction === "up" ? "text-emerald-600" : direction === "down" ? "text-red-600" : "text-gray-600";

  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;

  return (
    <div className={`flex items-center gap-1 ${colorClass} ${className}`}>
      {showIcon && <Icon className="w-3 h-3" aria-hidden="true" />}
      <span className="text-xs font-semibold">{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

