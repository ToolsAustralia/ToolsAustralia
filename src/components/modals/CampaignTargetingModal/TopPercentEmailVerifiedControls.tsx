"use client";

import React from "react";
import { Loader2, Users } from "lucide-react";
import { Input, Button } from "@/components/modals/ui";

interface TopPercentEmailVerifiedControlsProps {
  requiresEmailVerified: boolean;
  onRequiresEmailVerifiedChange: (next: boolean) => void;
  topPercent: string;
  onTopPercentChange: (next: string) => void;
  onPreview: () => void;
  previewLoading: boolean;
}

export default function TopPercentEmailVerifiedControls({
  requiresEmailVerified,
  onRequiresEmailVerifiedChange,
  topPercent,
  onTopPercentChange,
  onPreview,
  previewLoading,
}: TopPercentEmailVerifiedControlsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
      <label className="flex items-center gap-2 h-11 px-3 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-gray-800 dark:text-neutral-200">
        <input
          type="checkbox"
          checked={requiresEmailVerified}
          onChange={(e) => onRequiresEmailVerifiedChange(e.target.checked)}
        />
        Email verified only
      </label>
      <Input
        type="number"
        min={1}
        max={100}
        value={topPercent}
        onChange={(e) => onTopPercentChange(e.target.value)}
        placeholder="Top % major draw entries (optional)"
      />
      <div className="flex gap-2">
        <Button type="button" variant="primary" size="md" className="flex-1" onClick={onPreview} disabled={previewLoading}>
          {previewLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </>
          ) : (
            <>
              <Users className="w-4 h-4 mr-2" />
              Preview audience
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
