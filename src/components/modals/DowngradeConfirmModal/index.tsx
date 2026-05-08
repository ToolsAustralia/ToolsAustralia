"use client";

import React, { type FC } from "react";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import Shell, { type Tier } from "./Shell";
import Hero from "./Hero";
import BenefitsBody from "./BenefitsBody";
import ActionRow from "./ActionRow";

interface DowngradeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  fromPackageName: string;
  toPackageName: string;
  toPackagePrice: number;
  /** Order in body: partner offer access % → days of access → entries (matches MembershipSection). */
  toPartnerAccessPercent: number;
  toPartnerDiscountDays: number;
  toEntriesPerMonth: number;
  /** Display label for when the new plan activates, e.g. "Fri 26 Dec". */
  effectiveDateLabel?: string;
  currentEntries?: number;
  saveLabel?: string;
}

const TIER_FROM_NAME = (name?: string): Tier => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  return "tradie";
};

const DowngradeConfirmModal: FC<DowngradeConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  fromPackageName,
  toPackageName,
  toPackagePrice,
  toPartnerAccessPercent,
  toPartnerDiscountDays,
  toEntriesPerMonth,
  effectiveDateLabel,
  currentEntries,
  saveLabel,
}) => {
  const fromTier: Tier = TIER_FROM_NAME(fromPackageName);
  const toTier: Tier = TIER_FROM_NAME(toPackageName);
  const fromIcon: PackageIconData | null = getPackageIconByName(fromPackageName, "subscription");
  const toIcon: PackageIconData | null = getPackageIconByName(toPackageName, "subscription");

  return (
    <Shell isOpen={isOpen} onClose={onClose} toTier={toTier}>
      <Hero
        fromPackageName={fromPackageName}
        toPackageName={toPackageName}
        fromTier={fromTier}
        toTier={toTier}
        fromIcon={fromIcon}
        toIcon={toIcon}
        toPackagePrice={toPackagePrice}
      />
      <BenefitsBody
        toPackageName={toPackageName}
        toPartnerAccessPercent={toPartnerAccessPercent}
        toPartnerDiscountDays={toPartnerDiscountDays}
        toEntriesPerMonth={toEntriesPerMonth}
        currentEntries={currentEntries}
        saveLabel={saveLabel}
        effectiveDateLabel={effectiveDateLabel}
        fromPackageName={fromPackageName}
      />
      <div className="px-[18px] pb-3.5 max-xs:px-3 max-xs:pb-3">
        <ActionRow
          fromPackageName={fromPackageName}
          toPackageName={toPackageName}
          fromTier={fromTier}
          isLoading={isLoading}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      </div>
    </Shell>
  );
};

export default DowngradeConfirmModal;
