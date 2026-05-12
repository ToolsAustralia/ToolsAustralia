"use client";

import React from "react";
import { Button } from "@/components/modals/ui";

interface FooterProps {
  selectedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function Footer({ selectedCount, onCancel, onConfirm }: FooterProps) {
  return (
    <div className="flex shrink-0 flex-col-reverse sm:flex-row gap-2 sm:justify-end px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/80">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" variant="primary" onClick={onConfirm}>
        Save audience ({selectedCount} pinned)
      </Button>
    </div>
  );
}
