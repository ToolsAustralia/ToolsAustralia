"use client";

import React from "react";
import { useCompletedMajorDraws } from "@/hooks/queries/useMajorDrawQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface _MajorDraw {
  _id: string;
  name: string;
  drawDate: string;
  activationDate: string;
}

interface MajorDrawSelectorProps {
  currentDrawId: string | null;
  previousDrawId: string | null;
  onCurrentDrawChange: (drawId: string) => void;
  onPreviousDrawChange: (drawId: string) => void;
}

export function MajorDrawSelector({
  currentDrawId,
  previousDrawId,
  onCurrentDrawChange,
  onPreviousDrawChange,
}: MajorDrawSelectorProps) {
  const { data, isLoading } = useCompletedMajorDraws();

  const draws = data?.draws || [];

  if (isLoading) {
    return (
      <div className="flex gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (draws.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">No completed major draws available for comparison.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Current Draw</label>
        <select
          value={currentDrawId || ""}
          onChange={(e) => onCurrentDrawChange(e.target.value)}
          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white dark:bg-neutral-800 font-semibold text-gray-900 dark:text-white"
        >
          <option value="">Select current draw...</option>
          {draws.map((draw) => (
            <option key={draw._id} value={draw._id}>
              {draw.name} ({format(new Date(draw.drawDate), "MMM yyyy")})
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Previous Draw</label>
        <select
          value={previousDrawId || ""}
          onChange={(e) => onPreviousDrawChange(e.target.value)}
          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white dark:bg-neutral-800 font-semibold text-gray-900 dark:text-white"
        >
          <option value="">Select previous draw...</option>
          {draws
            .filter((draw) => draw._id !== currentDrawId)
            .map((draw) => (
              <option key={draw._id} value={draw._id}>
                {draw.name} ({format(new Date(draw.drawDate), "MMM yyyy")})
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}


