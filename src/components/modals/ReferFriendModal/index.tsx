"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Gift,
  LinkIcon,
  Sparkles,
  Users,
  Share2,
  Check,
  XCircle,
} from "lucide-react";
import { useReferralProfile } from "@/hooks/queries";
import { useReferralCode } from "@/hooks/useReferralCode";
import UpsellHero from "@/components/modals/upsell-shell/UpsellHero";
import InfoGrid from "@/components/modals/upsell-shell/InfoGrid";
import UrgencyBanner from "@/components/modals/upsell-shell/UrgencyBanner";
import Button from "@/components/ui/Button";
import Shell, { type Tier } from "./Shell";

/** Props — preserved byte-identically from the original monolith. */
export interface ReferFriendModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  userId: string;
  userFirstName?: string;
  /** Optional: the user's current membership tier for theming. Defaults to "tradie". */
  userTier?: Tier;
}

const FALLBACK_APP_URL: string =
  process.env.NEXT_PUBLIC_APP_URL || "https://tools-australia.com";

/** 3-step referral infographic rendered inside UpsellHero.
 * Each cell is flex-1 so labels split the available row width evenly instead of
 * wrapping a long phrase ("Both get +100 entries") into 3 cramped lines. */
const ReferralSteps: React.FC = () => (
  <div className="flex items-stretch justify-between gap-1.5 mt-1 w-full max-w-[440px] mx-auto">
    {(
      [
        { step: "1", label: "Share your code" },
        { step: "2", label: "They join & pay" },
        { step: "3", label: "Both get +100 entries" },
      ] as const
    ).map(({ step, label }, idx) => (
      <React.Fragment key={step}>
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-full bg-white/15 border border-white/25 inline-flex items-center justify-center text-[11px] font-black text-white max-xs:w-5 max-xs:h-5 max-xs:text-[9px]">
            {step}
          </div>
          <span className="text-[10px] font-semibold text-white/75 text-center leading-[1.25] max-xs:text-[9px]">
            {label}
          </span>
        </div>
        {idx < 2 && (
          <div className="w-3 h-px bg-white/25 self-center flex-shrink-0 max-xs:w-2" />
        )}
      </React.Fragment>
    ))}
  </div>
);

export const ReferFriendModal: React.FC<ReferFriendModalProps> = ({
  isOpen,
  onCloseAction,
  userId,
  userFirstName,
  userTier = "tradie",
}) => {
  const { referralCode, setReferralCode } = useReferralCode();
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useReferralProfile(userId);
  const [copyStatus, setCopyStatus] = useState<"idle" | "code" | "link">(
    "idle"
  );
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !!navigator.share) {
      setShareSupported(true);
    }
  }, []);

  /** Build the friendly share link whenever the referral code changes. */
  const shareLink = useMemo(() => {
    const code = profile?.code?.toUpperCase() || referralCode || "";
    if (typeof window === "undefined" || !window.location?.origin) {
      return `${FALLBACK_APP_URL.replace(/\/$/, "")}/membership?ref=${code}`;
    }
    return `${window.location.origin.replace(/\/$/, "")}/membership?ref=${code}`;
  }, [profile?.code, referralCode]);

  const handleCopy = useCallback(
    async (value: string, type: "code" | "link") => {
      try {
        await navigator.clipboard.writeText(value);
        setCopyStatus(type);
        if (type === "code") {
          setReferralCode(value);
        }
        setTimeout(() => setCopyStatus("idle"), 2000);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
      }
    },
    [setReferralCode]
  );

  const handleShare = useCallback(async () => {
    if (!profile?.code || typeof navigator === "undefined" || !navigator.share)
      return;
    try {
      await navigator.share({
        title: "Join me at Tools Australia",
        text: `Use my referral code ${profile.code} to unlock 100 bonus entries on your first membership!`,
        url: shareLink,
      });
      setReferralCode(profile.code);
    } catch (error) {
      console.error("Failed to share referral link:", error);
    }
  }, [profile?.code, shareLink, setReferralCode]);

  /** Map userTier → UpsellHero tone */
  const heroTone = (
    {
      tradie: "tier-tradie",
      foreman: "tier-foreman",
      boss: "tier-boss",
    } as const
  )[userTier];

  return (
    <Shell isOpen={isOpen} onClose={onCloseAction} tier={userTier}>
      {/* ── Hero ── */}
      <UpsellHero
        tone={heroTone}
        titleId="rf-headline"
        eyebrow={
          <>
            <Sparkles
              size={13}
              className="text-[var(--upsell-accent)] max-xs:size-3"
              fill="currentColor"
            />
            <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-white/80 max-xs:text-[9px]">
              GIVE 100, GET 100
            </span>
            <Sparkles
              size={13}
              className="text-[var(--upsell-accent)] max-xs:size-3"
              fill="currentColor"
            />
          </>
        }
        title={
          <>
            Refer a mate.{" "}
            <span style={{ color: "var(--upsell-accent)" }}>Both win.</span>
          </>
        }
        sub="Invite a friend and you both score 100 bonus entries when they complete their first membership or one-time package purchase."
        infographic={<ReferralSteps />}
      />

      {/* ── InfoGrid — gain-framed reward cells ── */}
      <InfoGrid
        framing="gain"
        title="YOUR REWARDS"
        cells={[
          {
            icon: <Sparkles size={16} />,
            title: "+100 entries",
            desc: "For you when they join",
          },
          {
            icon: <Gift size={16} />,
            title: "+100 for them",
            desc: "First-cycle bonus",
          },
          {
            icon: <Users size={16} />,
            title: "Unlimited",
            desc: "Refer as many as you want",
          },
        ]}
      />

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="mx-4 mb-3 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-6 text-center">
          <div className="inline-flex h-7 w-7 animate-spin rounded-full border-4 border-gray-300 dark:border-neutral-600 border-t-red-600" />
          <p className="mt-2.5 text-xs font-medium text-gray-600 dark:text-neutral-400">
            Fetching your personal referral code&hellip;
          </p>
        </div>
      )}

      {/* ── Error state ── */}
      {isError && (
        <div className="mx-4 mb-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-300" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                We hit a snag loading your code.
              </p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                Please try again or contact support if the problem continues.{" "}
                <button
                  onClick={() => refetch()}
                  className="font-semibold text-red-600 dark:text-red-300 underline underline-offset-2 hover:text-red-500 dark:hover:text-red-200 transition-colors"
                  type="button"
                >
                  Retry now
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile loaded — functional share UI ── */}
      {profile && (
        <div className="px-4 pb-3 space-y-3 max-xs:px-3">
          {/* Referral code display */}
          <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600/10 dark:bg-red-500/15">
                <LinkIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Your Referral Code
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
              Share this code with your mates. It never expires and always
              belongs to you.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border-2 border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 px-4 py-3 transition-all duration-300 hover:border-red-600/50">
              <span className="text-xl sm:text-2xl font-black tracking-[0.2em] text-gray-900 dark:text-white break-all text-center sm:text-left min-w-0">
                {profile.code}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(profile.code, "code")}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all duration-300 hover:bg-red-700 hover:shadow-lg hover:scale-105 active:scale-95 w-full sm:w-auto"
              >
                {copyStatus === "code" ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Share link */}
          <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Share2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Share Your Invite Link
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
              Skip the manual typing — send the link and their code is
              pre-filled at checkout.
            </p>

            <div className="space-y-2">
              {/* Link display + copy */}
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5 transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700">
                <span className="flex-1 truncate text-xs font-medium text-gray-700 dark:text-neutral-200">
                  {shareLink}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(shareLink, "link")}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-200 dark:bg-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-neutral-200 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-neutral-600 hover:scale-105 active:scale-95"
                >
                  {copyStatus === "link" ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Share buttons — row at all widths for mobile economy */}
              <div className="flex flex-row gap-2">
                <Button
                  variant="outline"
                  tone="red"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => handleCopy(shareLink, "link")}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </Button>

                {shareSupported && (
                  <Button
                    variant="primary"
                    tone="red"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleShare}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Stats grid — 2 cols at all widths. Dark mode uses opaque deep neutrals
              so the cards don't feel "see-through" against the modal frame. */}
          <section className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-white to-gray-50 dark:from-neutral-900 dark:to-neutral-950 p-3 sm:p-4 shadow-sm">
              <div className="absolute top-0 right-0 opacity-5 dark:opacity-15 pointer-events-none">
                <Users className="h-16 w-16 sm:h-20 sm:w-20 text-red-600 dark:text-red-400" />
              </div>
              <div className="relative z-10 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-red-600/10 dark:bg-red-500/20 flex-none">
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 truncate">
                      Referrals
                    </p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-none">
                      {profile.successfulConversions}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400 leading-snug">
                  +100 bonus entries each conversion.
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-white to-gray-50 dark:from-neutral-900 dark:to-neutral-950 p-3 sm:p-4 shadow-sm">
              <div className="absolute top-0 right-0 opacity-5 dark:opacity-15 pointer-events-none">
                <Gift className="h-16 w-16 sm:h-20 sm:w-20 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="relative z-10 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex-none">
                    <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 truncate">
                      Entries
                    </p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-none">
                      {profile.totalEntriesAwarded}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400 leading-snug">
                  No limit on invites.
                </p>
              </div>
            </div>
          </section>

          {/* Social proof urgency banner */}
          <UrgencyBanner
            tone="gold"
            title="The fastest way to stack entries is by inviting fellow tradies."
            sub={
              userFirstName
                ? `Thanks ${userFirstName}! Pro tip: send the link in a group chat tonight — you'll both be locked in for the next draw straight away.`
                : "Pro tip: send the link in a group chat tonight — you'll both be locked in for the next draw straight away."
            }
          />
        </div>
      )}

    </Shell>
  );
};

export default ReferFriendModal;
