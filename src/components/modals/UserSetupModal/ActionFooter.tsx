"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";

interface ActionFooterProps {
  /** True when the user should see the Back button (currentStepIndex > 0 + closable env). */
  showBack: boolean;
  /** Whether the primary button is disabled by validation/loading state. */
  primaryDisabled: boolean;
  /** Label shown on the primary button. */
  primaryLabel: string;
  /** Set true when the active step is the final one — swaps Next icon for Sparkles. */
  isFinalStep?: boolean;
  onBack: () => void;
  onPrimary: () => void;
}

const ActionFooter: React.FC<ActionFooterProps> = ({
  showBack,
  primaryDisabled,
  primaryLabel,
  isFinalStep = false,
  onBack,
  onPrimary,
}) => (
  <div className="border-t border-gray-200 dark:border-neutral-700 px-5 py-4 bg-gray-50/60 dark:bg-neutral-900/40">
    <div className="flex gap-2">
      {showBack && (
        <Button
          variant="outline"
          tone="neutral"
          size="md"
          onClick={onBack}
          className="flex-1 gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      <Button
        variant="primary"
        tone="red"
        size="md"
        disabled={primaryDisabled}
        onClick={onPrimary}
        className="flex-1 gap-1.5"
      >
        {primaryLabel}
        {!isFinalStep && <ChevronRight className="h-4 w-4" />}
      </Button>
    </div>
  </div>
);

export default ActionFooter;
