"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import Button from "@/components/ui/Button";
import styles from "./styles.module.css";

interface ActionRowProps {
  hasActiveSubscription: boolean;
  hasAccessToAdditionalPackages: boolean;
  onClose: () => void;
  onOpenSettingsSubscription?: () => void;
  onOpenMembershipModal?: () => void;
  onOpenSpecialPackages?: () => void;
}

const ActionRow: React.FC<ActionRowProps> = ({
  hasActiveSubscription,
  hasAccessToAdditionalPackages,
  onClose,
  onOpenSettingsSubscription,
  onOpenMembershipModal,
  onOpenSpecialPackages,
}) => {
  const showManage = hasActiveSubscription && !!onOpenSettingsSubscription;
  const showViewPlans = !hasActiveSubscription && !!onOpenMembershipModal;
  const showSpecial = hasAccessToAdditionalPackages && !!onOpenSpecialPackages;
  const showFallback = !hasActiveSubscription && !onOpenMembershipModal && !hasAccessToAdditionalPackages;
  const showCloseLink = showManage || showSpecial || !!onOpenMembershipModal;

  return (
    <div className="bg-white dark:bg-neutral-950 px-[18px] pb-3.5 pt-1 max-xs:px-3 max-xs:pb-3 flex flex-col gap-2">
      {showManage && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSettingsSubscription!();
          }}
          className={cn(
            "w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-sm tracking-[0.01em] uppercase border-0",
            styles.btn,
            styles.btnPrimary
          )}
          style={{
            background: "var(--tier-cta-bg)",
            color: "var(--tier-cta-text)",
            boxShadow: "var(--tier-cta-shadow)",
          }}
        >
          Manage membership
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      )}

      {showViewPlans && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenMembershipModal!();
          }}
          className={cn(
            "w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-sm tracking-[0.01em] uppercase border-0",
            styles.btn,
            styles.btnPrimary
          )}
          style={{
            background: "var(--tier-cta-bg)",
            color: "var(--tier-cta-text)",
            boxShadow: "var(--tier-cta-shadow)",
          }}
        >
          View membership plans
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      )}

      {showSpecial && (
        <Button
          variant="outline"
          tone="neutral"
          size="md"
          className="w-full rounded-xl"
          onClick={() => {
            onClose();
            onOpenSpecialPackages!();
          }}
        >
          Add more packages
          <ChevronRight size={14} strokeWidth={2.5} />
        </Button>
      )}

      {showFallback && (
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-sm tracking-[0.01em] uppercase border-0",
            styles.btn,
            styles.btnPrimary
          )}
          style={{
            background: "var(--tier-cta-bg)",
            color: "var(--tier-cta-text)",
            boxShadow: "var(--tier-cta-shadow)",
          }}
        >
          Got it
        </button>
      )}

      {showCloseLink && (
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-neutral-700 py-1"
        >
          Close
        </button>
      )}
    </div>
  );
};

export default ActionRow;
