"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useLoading } from "@/contexts/LoadingContext";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import { useToast } from "@/components/ui/Toast";
import { queryKeys } from "@/lib/queryKeys";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import { PRIZE_CATALOG } from "@/config/prizes";
import { cn } from "@/utils/cn";
import Hero from "./Hero";
import LoseGrid from "./LoseGrid";
import Banner from "./Banner";
import ActionRow from "./ActionRow";
import DowngradeCard, { type Tier } from "./DowngradeCard";
import TrustBar from "./TrustBar";
import styles from "./hero.module.css";

const CANCELLATION_UPSELL_ENTRIES = 100;

interface DowngradeOption {
  packageName: string;
  saveLabel?: string;
  onConfirm: () => void;
}

interface CancellationUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRedeem: () => void;
  onDecline: () => void;
  /** Subscription is past_due / has a failed renewal. Switches CTA to "Resolve payment", drops the +100 bonus. */
  isPastDue?: boolean;
  /** Caller for the "Resolve payment" CTA when `isPastDue`. */
  onResolvePayment?: () => void;
  /** Locked-in entries the user has accumulated for the current major draw. */
  accumulatedEntries?: number;
  /** Days remaining until the next major draw closes. */
  daysUntilDraw?: number;
  /** Pretty draw close label, e.g. "Fri 26 Dec". */
  drawCloseLabel?: string;
  /** Downgrade target — render the tier-coloured "Switch plan" card. Tier is derived from `packageName`. */
  downgrade?: DowngradeOption;
}

const TIER_FROM_NAME = (name?: string): Tier => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  return "tradie";
};

const TOOLSET_LABEL: Record<string, string> = {
  milwaukee: "Milwaukee",
  dewalt: "DeWalt",
  makita: "Makita",
  ryobi: "Ryobi",
};

/** "milwaukee-sidchrome" → "Milwaukee Combo + $5k cash". Drops the toolbox name to keep the label tight (3 lines max). */
const formatPrizeShortLabel = (slug: string): string => {
  const [tools] = slug.split("-");
  const toolsetLabel = TOOLSET_LABEL[tools] ?? tools;
  return `${toolsetLabel} Combo + $5k cash`;
};

const NON_CASH_PRIZE_SLUGS = PRIZE_CATALOG.map((p) => p.slug).filter((s) => s !== "cash-prize");

const CancellationUpsellModal: React.FC<CancellationUpsellModalProps> = ({
  isOpen,
  onClose,
  onRedeem,
  onDecline,
  isPastDue = false,
  onResolvePayment,
  accumulatedEntries = 0,
  daysUntilDraw,
  drawCloseLabel,
  downgrade,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { showLoading, hideLoading } = useLoading();
  const showEntryReward = useEntryRewardToast();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const downgradeTier: Tier | null = downgrade ? TIER_FROM_NAME(downgrade.packageName) : null;
  const downgradeIcon: PackageIconData | null = downgrade
    ? getPackageIconByName(downgrade.packageName, "subscription")
    : null;

  /** Random non-cash prize per modal open — re-rolls each time the user re-opens the modal. */
  const featuredPrize = useMemo(() => {
    if (!isOpen) return null;
    const slug = NON_CASH_PRIZE_SLUGS[Math.floor(Math.random() * NON_CASH_PRIZE_SLUGS.length)];
    const entry = PRIZE_CATALOG.find((p) => p.slug === slug);
    return {
      slug,
      shortLabel: formatPrizeShortLabel(slug),
      image: entry?.cardBackgroundImage || entry?.gallery?.[0]?.src || "/images/majordraws/milwaukee-set/MILWAUKEE.webp",
    };
  }, [isOpen]);

  const hasMembershipEntries = accumulatedEntries > 0;

  /** Entry animation gate. */
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return undefined;
  }, [isOpen]);

  /** Body scroll lock + Escape key handler. Mirrors original L122-L137. */
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      // Always clear to empty — capturing the previous value risks perpetuating a bad state
      // left by another modal that didn't clean up. Matches SubscriptionManagementModal's pattern.
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen, onClose]);

  /** Refresh user-facing data so we never show a stale entry count or stale downgrade options. */
  useEffect(() => {
    if (!isOpen) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    }
  }, [isOpen, userId, queryClient]);

  const handleRedeem = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    showLoading("Processing Reward", "", [
      "Verifying eligibility",
      "Granting free entries",
      "Adding entries to major draw",
      "Updating your dashboard",
    ]);

    try {
      const response = await fetch("/api/cancellation-upsell/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to redeem free entries");

      hideLoading();

      if (userId) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const o = old as Record<string, unknown>;
          return {
            ...o,
            totalEntries: (Number(o.totalEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
            currentDrawEntries: (Number(o.currentDrawEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
            oneTimeEntries: (Number(o.oneTimeEntries) || 0) + CANCELLATION_UPSELL_ENTRIES,
          };
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      }

      showEntryReward({
        entries: CANCELLATION_UPSELL_ENTRIES,
        drawType: "major",
        source: "cancellation-upsell-redeem",
      });
      onRedeem();
    } catch (error) {
      console.error("Failed to redeem free entries:", error);
      hideLoading();
      showToast({
        type: "error",
        title: "Couldn't redeem entries",
        message: error instanceof Error ? error.message : "Failed to redeem free entries. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = () => {
    onDecline();
    onClose();
  };

  const handleSwitchPlan = () => {
    if (!downgrade) return;
    downgrade.onConfirm();
  };

  const handleResolvePayment = () => {
    onResolvePayment?.();
  };

  if (!isOpen) return null;

  /** "Locked-in" copy varies by state — past-due / no-renewal members lose accumulated entries on cancel,
   *  not entries-already-in-the-draw, so the wording is softer. */
  const entriesLabelHero = isPastDue || !hasMembershipEntries ? "accumulated entries" : "entries";
  const heroEntriesCopy = hasMembershipEntries ? (
    <>
      You&apos;ve got <strong className="text-premium-gold font-bold">{accumulatedEntries.toLocaleString()} {entriesLabelHero}</strong> locked in the major draw.
    </>
  ) : (
    <>Hold up — there&apos;s still time to keep your spot in the major draw.</>
  );

  const showSpotCell = !isPastDue && hasMembershipEntries;
  const drawCloseText = drawCloseLabel
    ? `Draw closes ${drawCloseLabel}`
    : "Draw closes at the end of the cycle";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ zIndex: 80 }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={cn(
          "relative transform transition-all duration-300 ease-out w-full max-w-[600px] font-sans text-neutral-950 antialiased max-h-[82dvh] flex max-xs:max-h-[88dvh]",
          isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-headline"
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-all duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
        >
          <X size={14} strokeWidth={2} />
        </button>

        {/* Frame: scrollable container with custom scrollbar */}
        <div className={cn("relative rounded-[22px] bg-white dark:bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)] w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] max-xs:rounded-2xl", styles.scrollFrame)}>
          <Hero entriesCopy={heroEntriesCopy} accumulatedEntries={accumulatedEntries} />

          <LoseGrid
            isPastDue={isPastDue}
            hasMembershipEntries={hasMembershipEntries}
            accumulatedEntries={accumulatedEntries}
            featuredPrizeShortLabel={featuredPrize?.shortLabel ?? "major draw"}
            daysUntilDraw={daysUntilDraw}
            drawCloseText={drawCloseText}
            showSpotCell={showSpotCell}
          />

          <div className="px-4 max-xs:px-3">
            <Banner />

            <ActionRow
              isPastDue={isPastDue}
              isProcessing={isProcessing}
              onDecline={handleDecline}
              onRedeem={handleRedeem}
              onResolvePayment={handleResolvePayment}
            />
          </div>

          {downgrade && downgradeTier && (
            <div className="px-4 pb-3 max-xs:px-3 max-xs:pb-2.5">
              <DowngradeCard
                tier={downgradeTier}
                packageName={downgrade.packageName}
                saveLabel={downgrade.saveLabel}
                hasMembershipEntries={hasMembershipEntries}
                accumulatedEntries={accumulatedEntries}
                isProcessing={isProcessing}
                icon={downgradeIcon}
                onSwitchPlan={handleSwitchPlan}
              />
            </div>
          )}

          <TrustBar />
        </div>
      </div>
    </div>
  );
};

export default CancellationUpsellModal;
