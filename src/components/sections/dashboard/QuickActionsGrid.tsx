"use client";

import { Package, Gift, Ticket, UserPlus, History, Medal, Store, MessageCircle } from "lucide-react";
import { QuickTile } from "@/components/ui/QuickTile";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";

interface QuickActionsGridProps {
  multiplier: number;
  /** Claimable redeemables count for the Redeem badge (0/undefined → no badge). */
  redeemCount?: number;
  /** Whether the rewards program is currently enabled (redeem is disabled when paused). */
  rewardsEnabled?: boolean;
  onGetPackage: () => void;
  onRefer: () => void;
  onPastDraws: () => void;
  className?: string;
}

/** Quick-action glossy tile grid. Coming-soon tiles (Vouchers, Milestones) are gated. */
export default function QuickActionsGrid({
  multiplier,
  redeemCount,
  rewardsEnabled = true,
  onGetPackage,
  onRefer,
  onPastDraws,
  className,
}: QuickActionsGridProps) {
  // Only show a badge when a real promo multiplier is live — never a fabricated "50% OFF".
  const promoBadge = multiplier > 1 ? `${multiplier}×` : undefined;

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Quick actions</span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <QuickTile icon={Package} label="Packages" badge={promoBadge} accentHex="#ee0000" onClick={onGetPackage} />
        <QuickTile
          icon={Gift}
          label="Redeem"
          badge={rewardsEnabled && redeemCount ? redeemCount : undefined}
          accentHex="#d4af37"
          href={rewardsEnabled ? "/my-account/benefits" : undefined}
          disabled={!rewardsEnabled}
        />
        <QuickTile icon={Ticket} label="Vouchers" accentHex="#00c2ed" comingSoon />
        <QuickTile icon={UserPlus} label="Refer" badge="+100" accentHex="#34d399" onClick={onRefer} />
        <QuickTile icon={History} label="Past draws" accentHex="#8b5cf6" onClick={onPastDraws} />
        <QuickTile icon={Medal} label="Milestones" accentHex="#f59e0b" comingSoon={!isDashboardFeatureOn("milestoneProgress")} href={isDashboardFeatureOn("milestoneProgress") ? "/my-account/benefits" : undefined} />
        <QuickTile icon={Store} label="Partners" accentHex="#0ea5a5" href="/my-account/benefits" />
        <QuickTile icon={MessageCircle} label="Support" accentHex="#64748b" href="/my-account/support" />
      </div>
    </section>
  );
}
