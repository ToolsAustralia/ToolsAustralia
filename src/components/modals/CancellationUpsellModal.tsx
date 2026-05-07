"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useLoading } from "@/contexts/LoadingContext";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import { useToast } from "@/components/ui/Toast";
import { queryKeys } from "@/lib/queryKeys";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import { PRIZE_CATALOG } from "@/config/prizes";

const CANCELLATION_UPSELL_ENTRIES = 100;

type TierKey = "tradie" | "foreman" | "boss";

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

const TIER_FROM_NAME = (name?: string): TierKey => {
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

  const downgradeTier: TierKey | null = downgrade ? TIER_FROM_NAME(downgrade.packageName) : null;
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

  /** Always-positive progress bar — always second-to-last segment filled, regardless of entry count. */
  const TOTAL_SEG = 14;
  const segments = useMemo(
    () => Array.from({ length: TOTAL_SEG }, (_, i) => i < TOTAL_SEG - 1),
    []
  );

  const hasMembershipEntries = accumulatedEntries > 0;

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return undefined;
  }, [isOpen]);

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
        title: "Couldn’t redeem entries",
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
      You&apos;ve got <strong>{accumulatedEntries.toLocaleString()} {entriesLabelHero}</strong> locked in the major draw.
    </>
  ) : (
    <>Hold up — there&apos;s still time to keep your spot in the major draw.</>
  );

  const showSpotCell = !isPastDue && hasMembershipEntries;
  const drawCloseText = drawCloseLabel
    ? `Draw closes ${drawCloseLabel}`
    : "Draw closes at the end of the cycle";

  return (
    <div data-testid="cancellation-upsell-modal" className="cm-root fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      {/* Animated Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={`cm-stage relative transform transition-all duration-300 ease-out ${
          isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-headline"
      >
        <button className="cm-close" aria-label="Close" onClick={onClose} type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="cm-frame">
          {/* HERO */}
          <div className="cm-hero">
            <div className="cm-hero-inner">
              <div className="cm-eyebrow">
                <span className="line" />
                <span className="trophy">{TrophyIcon(14)}</span>
                <span className="text">Hold up, mate</span>
                <span className="trophy">{TrophyIcon(14)}</span>
                <span className="line r" />
              </div>

              <h2 className="cm-headline" id="cm-headline">
                <span className="small">You&apos;re already in.</span>
                Don&apos;t walk away from
                <br />
                <span className="gold">your next win.</span>
              </h2>

              <p className="cm-sub">{heroEntriesCopy}</p>

              <div className="cm-prize-banner">
                <Image
                  src="/images/background/promo/landing/all-prizes/all-prizes.webp"
                  alt="Major draw prize line-up"
                  width={1200}
                  height={400}
                  sizes="(max-width: 640px) 92vw, 540px"
                  style={{ width: "100%", height: "auto", display: "block" }}
                  priority={false}
                />
              </div>

              <div className="cm-progress">
                <div className="cm-progress-left">
                  <div className="cm-progress-label">You&apos;re this close to a win</div>
                  <div className="cm-progress-bar">
                    {segments.map((on, i) => (
                      <span key={i} className={"seg" + (on ? " fill" : "")} />
                    ))}
                    <span className="flag" aria-hidden>
                      →
                    </span>
                  </div>
                </div>
                <div className="cm-progress-right">
                  <div className="cm-progress-num">{accumulatedEntries.toLocaleString()}</div>
                  <div className="cm-progress-num-label">Active entries</div>
                </div>
              </div>
            </div>
          </div>

          {/* LOSE */}
          <div className="cm-lose">
            <div className="cm-lose-title">{isPastDue ? "Settle up & you keep" : "Cancel now & you walk away from"}</div>

            <div className="cm-lose-grid">
              <div className="cm-lose-cell">
                <div className="cm-lose-icon">{TicketIcon(20)}</div>
                <div className="num">
                  {hasMembershipEntries ? (
                    <>
                      <span>{accumulatedEntries.toLocaleString()}</span>{" "}
                      {isPastDue ? "accumulated entries" : "locked-in entries"}
                    </>
                  ) : (
                    <>
                      Your <span>accumulated</span> entries
                    </>
                  )}
                </div>
                <div className="desc">
                  {hasMembershipEntries
                    ? isPastDue
                      ? "Held while you sort the bill"
                      : "Already in the current draw"
                    : "Earned each cycle on your plan"}
                </div>
              </div>
              <div className="cm-lose-cell">
                <div className="cm-lose-icon">{TrophyIcon(20)}</div>
                <div className="num">
                  Your shot at the <span>{featuredPrize?.shortLabel ?? "major draw"}</span>
                </div>
                <div className="desc">Or $10,000 cash </div>
              </div>
              {showSpotCell && (
                <div className="cm-lose-cell">
                  <div className="cm-lose-icon">{CalendarIcon(20)}</div>
                  <div className="num">
                    Your spot in {typeof daysUntilDraw === "number" ? <span>{daysUntilDraw} days</span> : <span>the draw</span>}
                  </div>
                  <div className="desc">{drawCloseText}</div>
                </div>
              )}
              {!showSpotCell && (
                <div className="cm-lose-cell">
                  <div className="cm-lose-icon">{CalendarIcon(20)}</div>
                  <div className="num">
                    Your spot {typeof daysUntilDraw === "number" ? <>in <span>{daysUntilDraw} days</span></> : <>in the draw</>}
                  </div>
                  <div className="desc">
                    {isPastDue ? "Settle up to keep it" : "Renew to keep it"}
                  </div>
                </div>
              )}
            </div>

            <div className="cm-banner">
              <span className="cm-banner-icon">{StarIcon(16)}</span>
              <div>
                <div className="title">Someone&apos;s name gets called next draw.</div>
                <div className="sub">Stick around — it could just as easily be yours.</div>
              </div>
            </div>

            <div className="cm-actions">
              <button
                className="cm-btn cm-btn-cancel"
                onClick={handleDecline}
                disabled={isProcessing}
                type="button"
                data-testid="cancellation-upsell-decline"
              >
                <span className="icn">{WalkIcon(16)}</span>
                <span>
                  <span className="lbl">
                    No thanks,
                    <br />
                    cancel anyway
                  </span>
                </span>
              </button>
              {isPastDue ? (
                <button
                  className="cm-btn cm-btn-stay cm-btn-stay--plain"
                  onClick={handleResolvePayment}
                  disabled={isProcessing}
                  type="button"
                  data-testid="cancellation-upsell-accept"
                >
                  <span className="icn">{LockIcon(16)}</span>
                  <span>
                    <span className="lbl">Resolve payment</span>
                    <span className="sub">Keep your spot in the draw</span>
                  </span>
                </button>
              ) : (
                <button
                  className="cm-btn cm-btn-stay"
                  onClick={handleRedeem}
                  disabled={isProcessing}
                  type="button"
                  data-testid="cancellation-upsell-accept"
                >
                  <span className="icn">{LockIcon(16)}</span>
                  <span>
                    <span className="lbl">{isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}</span>
                    <span className="sub">Stay + 100 bonus entries</span>
                  </span>
                </button>
              )}
            </div>

            {downgrade && downgradeTier && (
              <>
                <div className="cm-downgrade-divider">
                  <span>Not feeling the price?</span>
                </div>

                <div className={`cm-downgrade tier-${downgradeTier}`}>
                  <div className="cm-downgrade-icon" aria-hidden>
                    {downgradeIcon ? (
                      <Image
                        src={downgradeIcon}
                        alt=""
                        width={48}
                        height={48}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : null}
                  </div>
                  <div className="cm-downgrade-row">
                    <div className="cm-downgrade-text">
                      <div className="t">
                        Switch to <span className="accent">{downgrade.packageName}</span>
                      </div>
                      <div className="d">Pay less, drop a tier — keep every entry.</div>
                    </div>
                    <button
                      className="cm-downgrade-cta"
                      onClick={handleSwitchPlan}
                      disabled={isProcessing}
                      type="button"
                    >
                      <span className="cta-label">Switch plan</span>
                      <span className="cta-arrow" aria-hidden>{ArrowRightIcon(12)}</span>
                    </button>
                  </div>
                  <div className="cm-downgrade-checks">
                    {hasMembershipEntries ? (
                      <span className="li">{CheckIcon(11)}{accumulatedEntries.toLocaleString()} entries stay</span>
                    ) : (
                      <span className="li">{CheckIcon(11)}Entries stay</span>
                    )}
                    {downgrade.saveLabel ? (
                      <span className="li">{CheckIcon(11)}{downgrade.saveLabel}</span>
                    ) : null}
                    <span className="li">{CheckIcon(11)}Cancel anytime</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* TRUST */}
          <div className="cm-trust">
            <div className="cm-trust-cell">
              <span className="ic">{ShieldIcon(12)}</span>
              <span className="lbl"><strong>SSL secure</strong>Entries safe</span>
            </div>
            <div className="cm-trust-cell">
              <span className="ic">{AwardIcon(12)}</span>
              <span className="lbl"><strong>NTP/16264</strong>Govt-certified</span>
            </div>
            <div className="cm-trust-cell">
              <span className="ic">{LockIcon(12)}</span>
              <span className="lbl"><strong>Cancel anytime</strong>No commitment</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .cm-stage {
          width: 100%;
          max-width: 600px;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          color: #0a0a0a;
          -webkit-font-smoothing: antialiased;
          max-height: calc(100dvh - 16px);
          display: flex;
        }
        .cm-frame {
          position: relative;
          border-radius: 22px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(0, 0, 0, 0.2);
          background: #fff;
          width: 100%;
          max-height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .cm-frame::-webkit-scrollbar {
          width: 6px;
        }
        .cm-frame::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 999px;
        }
        .cm-close {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 10;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.55);
          color: rgba(255, 255, 255, 0.95);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          transition: background 160ms ease, color 160ms ease;
          backdrop-filter: blur(8px);
        }
        .cm-close:hover {
          background: rgba(0, 0, 0, 0.75);
          color: #fff;
        }

        .cm-hero {
          position: relative;
          background:
            radial-gradient(900px 360px at 50% -120px, rgba(238, 0, 0, 0.32), transparent 65%),
            radial-gradient(600px 300px at 50% 120%, rgba(212, 175, 55, 0.18), transparent 60%),
            linear-gradient(180deg, #0a0a0a 0%, #141416 60%, #0a0a0a 100%);
          color: #fff;
          padding: 14px 16px 12px;
          overflow: hidden;
        }
        .cm-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            45deg,
            transparent 0 14px,
            rgba(255, 255, 255, 0.012) 14px 28px
          );
          pointer-events: none;
        }
        .cm-hero-inner {
          position: relative;
          z-index: 2;
        }

        .cm-eyebrow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .cm-eyebrow .line {
          flex: 0 0 32px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.6));
        }
        .cm-eyebrow .line.r {
          background: linear-gradient(90deg, rgba(212, 175, 55, 0.6), transparent);
        }
        .cm-eyebrow .text {
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #d4af37;
        }
        .cm-eyebrow .trophy {
          color: #d4af37;
          display: inline-flex;
        }

        .cm-headline {
          font-family: "Anton", "Inter", sans-serif;
          font-weight: 400;
          font-size: 28px;
          line-height: 1;
          letter-spacing: 0.005em;
          text-align: center;
          text-transform: uppercase;
          margin: 0 0 6px;
        }
        .cm-headline .gold {
          color: #d4af37;
        }
        .cm-headline .small {
          display: block;
          font-family: "Inter", sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: rgba(255, 255, 255, 0.55);
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .cm-sub {
          text-align: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.72);
          max-width: 440px;
          margin: 0 auto 8px;
          line-height: 1.45;
        }
        .cm-sub strong {
          color: #d4af37;
          font-weight: 700;
        }

        .cm-prize-banner {
          margin-top: 6px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            radial-gradient(600px 200px at 50% 50%, rgba(212, 175, 55, 0.1), transparent 70%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15));
          line-height: 0;
        }

        .cm-progress {
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 8px 12px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
        }
        .cm-progress-left {
          min-width: 0;
        }
        .cm-progress-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #4ade80;
          margin-bottom: 6px;
        }
        .cm-progress-bar {
          position: relative;
          display: flex;
          gap: 3px;
          height: 10px;
          align-items: center;
        }
        .cm-progress-bar :global(.seg) {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 2px;
        }
        .cm-progress-bar :global(.seg.fill) {
          background: linear-gradient(90deg, #16a34a, #22c55e);
          box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
        }
        .cm-progress-bar :global(.flag) {
          margin-left: 6px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 13px;
        }
        .cm-progress-right {
          text-align: center;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          padding-left: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .cm-progress-num {
          font-family: "Anton", sans-serif;
          font-size: 24px;
          color: #fff;
          line-height: 1;
        }
        .cm-progress-num-label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.55);
          margin-top: 3px;
          text-align: center;
          white-space: nowrap;
        }

        .cm-lose {
          background: #fff;
          padding: 12px 16px 12px;
        }
        .cm-lose-title {
          text-align: center;
          font-weight: 800;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #525252;
          margin-bottom: 10px;
          position: relative;
        }
        .cm-lose-title::before,
        .cm-lose-title::after {
          content: "";
          position: absolute;
          top: 50%;
          width: 28px;
          height: 1px;
          background: #e5e5e5;
        }
        .cm-lose-title::before {
          left: 50%;
          transform: translateX(calc(-100% - 130px));
        }
        .cm-lose-title::after {
          right: 50%;
          transform: translateX(calc(100% + 130px));
        }

        .cm-lose-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0;
          align-items: stretch;
        }
        .cm-lose-cell {
          text-align: center;
          padding: 2px 8px 0;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .cm-lose-cell :global(.num) {
          flex: 1;
        }
        .cm-lose-cell + .cm-lose-cell::before {
          content: "";
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 6px;
          width: 1px;
          background: #e5e5e5;
        }
        .cm-lose-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: linear-gradient(180deg, #fff5f5, #fef2f2);
          border: 1px solid #fee2e2;
          color: #b91c1c;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
        }
        .cm-lose-cell :global(.num) {
          font-weight: 800;
          font-size: 12px;
          color: #0a0a0a;
          margin-bottom: 2px;
          line-height: 1.25;
        }
        .cm-lose-cell :global(.num span) {
          color: #ee0000;
          font-weight: 800;
        }
        .cm-lose-cell :global(.desc) {
          font-size: 10px;
          color: #525252;
          line-height: 1.35;
        }

        .cm-banner {
          margin: 10px 0 0;
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .cm-banner-icon {
          width: 26px;
          height: 26px;
          flex: 0 0 26px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f4cf6b, #d4af37);
          color: #0a0a0a;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(212, 175, 55, 0.3);
        }
        .cm-banner :global(.title) {
          font-size: 12px;
          font-weight: 800;
          color: #0a0a0a;
          line-height: 1.25;
        }
        .cm-banner :global(.sub) {
          font-size: 11px;
          color: #5b2a02;
          font-weight: 600;
          margin-top: 2px;
          line-height: 1.3;
        }

        .cm-actions {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 8px;
        }
        .cm-btn {
          border-radius: 10px;
          padding: 9px 12px;
          font-family: "Inter", sans-serif;
          font-weight: 800;
          letter-spacing: 0.01em;
          display: flex;
          align-items: center;
          gap: 8px;
          text-align: left;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .cm-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .cm-btn :global(.icn) {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 28px;
        }
        .cm-btn :global(.lbl) {
          display: block;
          font-size: 12px;
          line-height: 1.15;
        }
        .cm-btn :global(.sub) {
          display: block;
          font-size: 10px;
          font-weight: 500;
          opacity: 0.75;
          margin-top: 1px;
          letter-spacing: 0;
        }
        .cm-btn-cancel {
          background: #fff;
          border: 1.5px solid #e5e5e5;
          color: #525252;
        }
        .cm-btn-cancel:hover:not(:disabled) {
          background: #fafafa;
          border-color: #a3a3a3;
          color: #b91c1c;
        }
        .cm-btn-cancel :global(.icn) {
          background: #f4f4f5;
          color: #525252;
        }
        .cm-btn-cancel:hover:not(:disabled) :global(.icn) {
          background: #fef2f2;
          color: #b91c1c;
        }
        .cm-btn-stay {
          background: linear-gradient(180deg, #ee0000, #b91c1c);
          color: #fff;
          border: 1.5px solid #b91c1c;
          position: relative;
          box-shadow: 0 8px 18px rgba(238, 0, 0, 0.28);
        }
        .cm-btn-stay:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px rgba(238, 0, 0, 0.36);
        }
        .cm-btn-stay :global(.icn) {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
        .cm-btn-stay::after {
          content: "+100 BONUS";
          position: absolute;
          top: -7px;
          right: 10px;
          background: linear-gradient(135deg, #f4cf6b, #d4af37);
          color: #0a0a0a;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.1em;
          padding: 2px 6px;
          border-radius: 999px;
          border: 1.5px solid #fff;
          box-shadow: 0 3px 8px rgba(212, 175, 55, 0.45);
        }
        .cm-btn-stay--plain::after {
          content: none;
        }

        .cm-downgrade-divider {
          text-align: center;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #525252;
          margin: 12px 0 8px;
          position: relative;
        }
        .cm-downgrade-divider span {
          background: #fff;
          padding: 0 12px;
          position: relative;
          z-index: 2;
        }
        .cm-downgrade-divider::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 1px;
          background: #e5e5e5;
          z-index: 1;
        }

        .cm-downgrade {
          position: relative;
          background: linear-gradient(180deg, #161618, #0a0a0a);
          color: #fff;
          border-radius: 14px;
          padding: 14px 14px 12px;
          /* No overflow:hidden — icon badge intentionally pokes out the top-left.
             The ::before glow uses border-radius:inherit so it stays clipped. */
        }
        .cm-downgrade::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--tier-glow);
          border-radius: inherit;
          pointer-events: none;
        }
        /* Icon → top-left corner badge, slightly overlapping the rounded corner. */
        .cm-downgrade-icon {
          position: absolute;
          top: -10px;
          left: -8px;
          z-index: 3;
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: var(--tier-badge-bg);
          border: 2px solid var(--tier-badge-border);
          box-shadow: var(--tier-badge-shadow);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 5px;
          transform: rotate(-4deg);
        }
        .cm-downgrade-row {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          padding-left: 44px;
          min-height: 36px;
        }
        .cm-downgrade-text {
          flex: 1 1 auto;
          min-width: 0;
        }
        .cm-downgrade-text :global(.t) {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.02em;
          line-height: 1.2;
          margin-bottom: 2px;
        }
        .cm-downgrade-text :global(.t .accent) {
          color: var(--tier-color);
        }
        .cm-downgrade-text :global(.d) {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.35;
        }
        /* Bottom row — 3 ticks always horizontally aligned across full card width. */
        .cm-downgrade-checks {
          position: relative;
          z-index: 2;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.85);
        }
        .cm-downgrade-checks :global(.li) {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        /* Distribute the 3 ticks: 1st left, 2nd centered, 3rd right. */
        .cm-downgrade-checks :global(.li:nth-child(1)) { justify-self: start; }
        .cm-downgrade-checks :global(.li:nth-child(2)) { justify-self: center; }
        .cm-downgrade-checks :global(.li:nth-child(3)) { justify-self: end; }
        .cm-downgrade-checks :global(.li svg) {
          color: var(--tier-color);
          flex: 0 0 11px;
        }
        .cm-downgrade-cta {
          flex: 0 0 auto;
          background: var(--tier-cta-bg);
          color: var(--tier-cta-text);
          font-family: "Inter", sans-serif;
          font-weight: 800;
          font-size: 11px;
          letter-spacing: 0.08em;
          padding: 9px 12px;
          border-radius: 9px;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          transition: transform 160ms ease, filter 160ms ease;
          box-shadow: var(--tier-cta-shadow);
        }
        .cm-downgrade-cta:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }
        .cm-downgrade-cta:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .cm-downgrade-cta :global(.cta-arrow) {
          display: inline-flex;
          align-items: center;
        }

        /* === Tier themes — match MembershipSection MEMBERSHIP_TAB_COLOR_MAP === */
        /* Tradie membership card → makita-teal (#00c2ed cyan) */
        .cm-downgrade.tier-tradie {
          --tier-color: #5ce0ff;
          --tier-glow: radial-gradient(circle at 0% 50%, rgba(0, 194, 237, 0.22), transparent 60%);
          --tier-badge-bg: linear-gradient(135deg, #00c2ed 0%, #5ca9ec 100%);
          --tier-badge-border: rgba(255, 255, 255, 0.95);
          --tier-badge-shadow: 0 8px 22px rgba(0, 194, 237, 0.45), 0 0 0 1px rgba(0, 194, 237, 0.5);
          --tier-cta-bg: linear-gradient(135deg, #5ca9ec, #00c2ed);
          --tier-cta-text: #ffffff;
          --tier-cta-shadow: 0 6px 14px rgba(0, 194, 237, 0.45);
        }
        /* Foreman membership card → dewalt-yellow (#ffd200) */
        .cm-downgrade.tier-foreman {
          --tier-color: #ffe066;
          --tier-glow: radial-gradient(circle at 0% 50%, rgba(255, 210, 0, 0.22), transparent 60%);
          --tier-badge-bg: linear-gradient(135deg, #ffe066 0%, #ffd200 100%);
          --tier-badge-border: rgba(255, 255, 255, 0.95);
          --tier-badge-shadow: 0 8px 22px rgba(255, 210, 0, 0.5), 0 0 0 1px rgba(255, 210, 0, 0.5);
          --tier-cta-bg: linear-gradient(135deg, #ffe066, #ffd200);
          --tier-cta-text: #0a0a0a;
          --tier-cta-shadow: 0 6px 14px rgba(255, 210, 0, 0.45);
        }
        /* Boss membership card → boss-red (#ee0000) */
        .cm-downgrade.tier-boss {
          --tier-color: #ff6b6b;
          --tier-glow: radial-gradient(circle at 0% 50%, rgba(238, 0, 0, 0.24), transparent 60%);
          --tier-badge-bg: linear-gradient(135deg, #ff4444 0%, #ee0000 100%);
          --tier-badge-border: rgba(255, 255, 255, 0.95);
          --tier-badge-shadow: 0 8px 22px rgba(238, 0, 0, 0.5), 0 0 0 1px rgba(238, 0, 0, 0.5);
          --tier-cta-bg: linear-gradient(135deg, #ff3333, #ee0000);
          --tier-cta-text: #ffffff;
          --tier-cta-shadow: 0 6px 14px rgba(238, 0, 0, 0.45);
        }

        .cm-trust {
          background: #fafafa;
          border-top: 1px solid #e5e5e5;
          padding: 10px 16px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
        }
        .cm-trust-cell {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          color: #525252;
          line-height: 1.3;
          padding: 0 10px;
          position: relative;
        }
        .cm-trust-cell .lbl {
          display: inline-flex;
          flex-direction: column;
          min-width: 0;
        }
        .cm-trust-cell + .cm-trust-cell::before {
          content: "";
          position: absolute;
          left: 0;
          top: 4px;
          bottom: 4px;
          width: 1px;
          background: #e5e5e5;
        }
        .cm-trust-cell .ic {
          flex: 0 0 20px;
          width: 20px;
          height: 20px;
          border-radius: 5px;
          background: #fff;
          border: 1px solid #e5e5e5;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #b91c1c;
        }
        .cm-trust-cell strong {
          color: #0a0a0a;
          font-weight: 700;
          display: block;
        }

        /* Same layout at every size — only proportional adjustments. */
        @media (max-width: 540px) {
          .cm-stage {
            max-height: calc(100dvh - 8px);
          }
          .cm-frame {
            border-radius: 16px;
            scrollbar-width: none;
            -ms-overflow-style: none;
            scrollbar-gutter: auto;
          }
          .cm-frame::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
          }
          .cm-hero {
            padding: 12px 12px 10px;
          }
          .cm-lose {
            padding: 10px 12px 10px;
          }
          .cm-eyebrow {
            gap: 8px;
            margin-bottom: 4px;
          }
          .cm-eyebrow .line {
            flex: 0 0 18px;
          }
          .cm-eyebrow .text {
            font-size: 10px;
            letter-spacing: 0.18em;
          }
          .cm-headline {
            font-size: 22px;
          }
          .cm-headline .small {
            font-size: 10px;
            margin-bottom: 2px;
          }
          .cm-sub {
            font-size: 11px;
            margin: 0 auto 6px;
            line-height: 1.35;
          }
          .cm-prize-banner {
            margin-top: 4px;
            border-radius: 10px;
          }
          .cm-progress {
            margin-top: 8px;
            padding: 6px 10px;
            gap: 8px;
            border-radius: 10px;
          }
          .cm-progress-label {
            font-size: 9px;
            letter-spacing: 0.14em;
            margin-bottom: 4px;
          }
          .cm-progress-bar {
            height: 8px;
            gap: 2px;
          }
          .cm-progress-bar :global(.seg) {
            height: 6px;
          }
          .cm-progress-right {
            padding-left: 10px;
          }
          .cm-progress-num {
            font-size: 20px;
          }
          .cm-progress-num-label {
            font-size: 8px;
            margin-top: 2px;
          }
          .cm-lose-title {
            font-size: 9px;
            margin-bottom: 8px;
          }
          .cm-lose-title::before,
          .cm-lose-title::after {
            display: none;
          }
          .cm-lose-cell {
            padding: 2px 4px 0;
          }
          .cm-lose-cell + .cm-lose-cell::before {
            top: 4px;
            bottom: 4px;
          }
          .cm-lose-icon {
            width: 28px;
            height: 28px;
            border-radius: 7px;
            margin-bottom: 4px;
          }
          .cm-lose-icon :global(svg) {
            width: 16px;
            height: 16px;
          }
          .cm-lose-cell :global(.num) {
            font-size: 11px;
            margin-bottom: 1px;
          }
          .cm-lose-cell :global(.desc) {
            font-size: 9px;
            line-height: 1.3;
          }
          .cm-banner {
            margin-top: 8px;
            padding: 6px 8px;
            gap: 6px;
            border-radius: 8px;
          }
          .cm-banner-icon {
            width: 22px;
            height: 22px;
            flex: 0 0 22px;
          }
          .cm-banner-icon :global(svg) {
            width: 12px;
            height: 12px;
          }
          .cm-banner :global(.title) {
            font-size: 11px;
          }
          .cm-banner :global(.sub) {
            font-size: 10px;
          }
          .cm-actions {
            margin-top: 10px;
            gap: 6px;
          }
          .cm-btn {
            padding: 7px 9px;
            border-radius: 9px;
            gap: 6px;
          }
          .cm-btn :global(.icn) {
            width: 24px;
            height: 24px;
            flex: 0 0 24px;
            border-radius: 6px;
          }
          .cm-btn :global(.icn svg) {
            width: 12px;
            height: 12px;
          }
          .cm-btn :global(.lbl) {
            font-size: 11px;
          }
          .cm-btn :global(.sub) {
            font-size: 9px;
          }
          .cm-btn-stay::after {
            font-size: 7px;
            padding: 2px 5px;
            top: -7px;
            right: 6px;
            letter-spacing: 0.08em;
            border-width: 1px;
          }
          .cm-downgrade-divider {
            margin: 8px 0 6px;
            font-size: 8px;
          }
          .cm-downgrade {
            padding: 12px 10px 10px;
            border-radius: 12px;
          }
          .cm-downgrade-icon {
            top: -8px;
            left: -6px;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            padding: 3px;
          }
          .cm-downgrade-row {
            padding-left: 36px;
            gap: 8px;
          }
          .cm-downgrade-text :global(.t) {
            font-size: 12px;
          }
          .cm-downgrade-text :global(.d) {
            font-size: 10px;
          }
          .cm-downgrade-checks {
            gap: 4px;
            font-size: 9px;
            margin-top: 8px;
            padding-top: 8px;
          }
          .cm-downgrade-cta {
            font-size: 10px;
            padding: 7px 10px;
            letter-spacing: 0.06em;
            gap: 0;
          }
          /* Hide the arrow on small screens to keep the button width tight. */
          .cm-downgrade-cta :global(.cta-arrow) {
            display: none;
          }
          .cm-trust {
            padding: 6px 8px;
          }
          .cm-trust-cell {
            font-size: 8px;
            gap: 4px;
            padding: 0 4px;
          }
          .cm-trust-cell .ic {
            flex: 0 0 18px;
            width: 18px;
            height: 18px;
            border-radius: 4px;
          }
          .cm-trust-cell .ic :global(svg) {
            width: 10px;
            height: 10px;
          }
          .cm-close {
            top: 8px;
            right: 8px;
            width: 26px;
            height: 26px;
          }
        }
      `}</style>
    </div>
  );
};

/* Inline icons (Lucide-style, currentColor) */
function TrophyIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
function TicketIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}
function CalendarIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}
function WalkIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2" />
      <path d="M4 22l5-7" />
      <path d="M9 15l-2-5 5-2 4 5 3 1" />
      <path d="M11 18l3 4" />
    </svg>
  );
}
function ShieldIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function AwardIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}
function LockIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function StarIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  );
}
function ArrowRightIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
function CheckIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default CancellationUpsellModal;
