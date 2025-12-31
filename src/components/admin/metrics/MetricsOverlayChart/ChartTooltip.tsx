"use client";

import React from "react";

export interface ChartTooltipProps {
  label?: string;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  active?: boolean;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      {label && <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>}
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }}></div>
            <span className="text-xs text-gray-600">{item.name}:</span>
            <span className="text-xs font-semibold text-gray-900">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

