"use client";

import React from "react";
import { Button } from "@/components/modals/ui";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  previewLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export default function PaginationControls({
  page,
  totalPages,
  totalCount,
  hasPrevPage,
  hasNextPage,
  previewLoading,
  onPrev,
  onNext,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 py-2 border-t border-gray-200 dark:border-neutral-800 px-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasPrevPage || previewLoading}
        onClick={onPrev}
      >
        Previous
      </Button>
      <span className="text-xs text-gray-600 dark:text-neutral-400">
        Page {page} / {totalPages} ({totalCount.toLocaleString()} users)
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNextPage || previewLoading}
        onClick={onNext}
      >
        Next
      </Button>
    </div>
  );
}
