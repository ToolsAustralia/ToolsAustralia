"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  hasPreviewUsers: boolean;
  previewLoading: boolean;
  addingAllMatching: boolean;
  previewError: string | null;
  previewWarning: string | null;
  showEmptyHint: boolean;
  onAddVisible: () => void;
  onAddAllMatching: () => void;
  onClearSelection: () => void;
}

export default function SelectionToolbar({
  selectedCount,
  totalCount,
  hasPreviewUsers,
  previewLoading,
  addingAllMatching,
  previewError,
  previewWarning,
  showEmptyHint,
  onAddVisible,
  onAddAllMatching,
  onClearSelection,
}: SelectionToolbarProps) {
  return (
    <>
      {previewError && (
        <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
          {previewError}
        </div>
      )}
      {previewWarning && (
        <div className="text-sm text-amber-800 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-md px-3 py-2">
          {previewWarning}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-gray-700 dark:text-neutral-300">
          <strong>{selectedCount}</strong> user{selectedCount !== 1 ? "s" : ""} pinned
        </span>
        <button
          type="button"
          onClick={onAddVisible}
          className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-40 disabled:no-underline"
          disabled={!hasPreviewUsers || previewLoading || addingAllMatching}
        >
          Add visible page
        </button>
        <button
          type="button"
          onClick={onAddAllMatching}
          className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-40 disabled:no-underline inline-flex items-center gap-1.5"
          disabled={previewLoading || addingAllMatching}
        >
          {addingAllMatching ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Adding all…
            </>
          ) : (
            <>
              Add all matching
              {totalCount > 0 ? (
                <span className="text-gray-500 dark:text-neutral-500 font-normal tabular-nums">
                  ({totalCount.toLocaleString()})
                </span>
              ) : null}
            </>
          )}
        </button>
        <button type="button" onClick={onClearSelection} className="text-gray-600 dark:text-neutral-400 hover:underline">
          Clear all pins
        </button>
      </div>
      {showEmptyHint && (
        <p className="text-xs text-gray-500 dark:text-neutral-500">
          Run <strong>Preview audience</strong> first to see the match count, or use <strong>Add all matching</strong> to pin everyone who fits the current filters.
        </p>
      )}
    </>
  );
}
