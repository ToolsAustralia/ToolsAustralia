"use client";

import { Ticket, Gift, Percent, UserPlus, Trophy, Medal, Store, Headphones } from "lucide-react";
import { QuickTile } from "@/components/ui/QuickTile";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import { CT } from "@/utils/dashboard/tile-colors";

interface QuickActionsGridProps {
  multiplier: number;
  /** Whether the user gets 50%-off Additional packages (members / current-draw entrants). */
  hasAdditionalAccess?: boolean;
  /** Claimable redeemables count for the Redeem badge. */
  redeemCount?: number;
  rewardsEnabled?: boolean;
  onGetPackage: () => void;
  onRefer: () => void;
  onPastDraws: () => void;
  className?: string;
}

/**
 * Quick-action glossy tile grid — ported from the prototype. Mobile: 8 tiles /
 * 4-col (adds Partners + Support since there's no sidebar). Desktop: 6 tiles /
 * 3-col (Partners/Support live in the sidebar). Coming-soon tiles are gated.
 */
export default function QuickActionsGrid({
  multiplier,
  hasAdditionalAccess = false,
  redeemCount,
  rewardsEnabled = true,
  onGetPackage,
  onRefer,
  onPastDraws,
  className,
}: QuickActionsGridProps) {
  // Live multiplier wins; else the real 50%-off (Additional packages) for eligible users; else no badge.
  const packagesBadge = multiplier > 1 ? `${multiplier}×` : hasAdditionalAccess ? "50% OFF" : undefined;
  const milestonesOn = isDashboardFeatureOn("milestoneProgress");

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Quick actions</span>
        <span className="text-[11px] font-bold text-muted-token">Edit</span>
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-3">
        <QuickTile icon={Ticket} label="Packages" badge={packagesBadge} accentHex={CT.red} onClick={onGetPackage} />
        <QuickTile
          icon={Gift}
          label="Redeem"
          badge={rewardsEnabled && redeemCount ? redeemCount : undefined}
          accentHex={CT.gold}
          href={rewardsEnabled ? "/my-account/rewards" : undefined}
          disabled={!rewardsEnabled}
        />
        <QuickTile icon={Percent} label="Vouchers" accentHex={CT.blue} comingSoon />
        <QuickTile icon={UserPlus} label="Refer" badge="+100" accentHex={CT.green} onClick={onRefer} />
        <QuickTile icon={Trophy} label="Past Draws" accentHex={CT.amber} onClick={onPastDraws} />
        <QuickTile
          icon={Medal}
          label="Milestones"
          accentHex={CT.violet}
          comingSoon={!milestonesOn}
          href={milestonesOn ? "/my-account/rewards" : undefined}
        />
        {/* Mobile-only: Partners + Support (they live in the desktop sidebar). */}
        <QuickTile icon={Store} label="Partners" accentHex={CT.blue} href="/my-account/rewards" className="lg:hidden" />
        <QuickTile icon={Headphones} label="Support" accentHex={CT.green} href="/my-account/support" className="lg:hidden" />
      </div>
    </section>
  );
}
