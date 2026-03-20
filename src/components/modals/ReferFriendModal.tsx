"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, LinkIcon, Sparkles, Users, Share2, Check, TrendingUp, Award } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useReferralProfile } from "@/hooks/queries";
import { useReferralCode } from "@/hooks/useReferralCode";

interface ReferFriendModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  userId: string;
  userFirstName?: string;
}

const FALLBACK_APP_URL: string = process.env.NEXT_PUBLIC_APP_URL || "https://tools-australia.com";

export const ReferFriendModal: React.FC<ReferFriendModalProps> = ({ isOpen, onCloseAction, userId, userFirstName }) => {
  const { referralCode, setReferralCode } = useReferralCode();
  const { data: profile, isLoading, isError, refetch } = useReferralProfile(userId);
  const [copyStatus, setCopyStatus] = useState<"idle" | "code" | "link">("idle");
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !!navigator.share) {
      setShareSupported(true);
    }
  }, []);

  // Build the friendly share link whenever the referral code changes.
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
    if (!profile?.code || typeof navigator === "undefined" || !navigator.share) return;

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

  return (
    <ModalContainer isOpen={isOpen} onClose={onCloseAction} size="lg">
      <ModalHeader
        title="Refer a Friend & Both Score 100 Bonus Entries"
        
        onClose={onCloseAction}
        showLogo
      />

      <ModalContent className="space-y-5">
        {/* Hero Banner with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#ee0000] via-[#ff3333] to-[#ff4444] p-6 shadow-lg">
          <div className="absolute top-0 right-0 opacity-10">
            <Award className="h-32 w-32 text-white" />
          </div>
          <div className="relative z-10 flex items-start gap-4">
           
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">Double the Rewards!</h3>
              <p className="mt-1 text-sm text-white/90 leading-relaxed">
                Invite a mate and you both score 100 bonus entries when they complete their first membership or one-time package purchase.
              </p>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 bg-gray-50/50 dark:bg-neutral-800/50 p-8 text-center">
            <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-gray-300 dark:border-neutral-600 border-t-[#ee0000]" />
            <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">Fetching your personal referral code...</p>
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-800 dark:text-red-300">We hit a snag loading your code.</p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  Please try again or contact support if the problem continues.{" "}
                  <button
                    onClick={() => refetch()}
                    className="font-semibold text-red-600 dark:text-red-400 underline underline-offset-2 hover:text-red-500 dark:hover:text-red-300 transition-colors"
                    type="button"
                  >
                    Retry now
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {profile && (
          <>
            {/* Referral Code Section - Compact on mobile */}
            <section className="group rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
                <div className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-[#ee0000]/10 dark:bg-[#ee0000]/20">
                  <LinkIcon className="h-3 w-3 sm:h-4 sm:w-4 text-[#ee0000]" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Your Referral Code</h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 sm:mb-4">
                Share this code with your mates. It never expires and always belongs to you.
              </p>

              <div className="relative">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border-2 border-gray-200 dark:border-neutral-600 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-700 dark:to-neutral-800 px-3 py-2.5 sm:px-5 sm:py-4 transition-all duration-300 hover:border-[#ee0000]/50 dark:hover:border-[#ee0000]/50">
                  <span className="text-lg sm:text-3xl font-black tracking-[0.1em] sm:tracking-[0.3em] text-gray-900 dark:text-white break-all text-center sm:text-left min-w-0">{profile.code}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(profile.code, "code")}
                    className="group/btn flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#ee0000] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 hover:bg-red-600 hover:shadow-lg hover:scale-105 active:scale-95 w-full sm:w-auto"
                  >
                    {copyStatus === "code" ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 transition-transform group-hover/btn:scale-110" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* Share Link Section - Enhanced */}
            <section className="group rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                  <Share2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Share Your Invite Link</h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                Skip the manual typing—send the link and their code is pre-filled at checkout.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/50 px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700">
                  <span className="flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">{shareLink}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(shareLink, "link")}
                    className="group/btn flex shrink-0 items-center gap-2 rounded-lg bg-gray-200 dark:bg-neutral-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-neutral-500 hover:scale-105 active:scale-95"
                  >
                    {copyStatus === "link" ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {shareSupported && (
                  <Button
                    onClick={handleShare}
                    variant="primary"
                    className="flex items-center justify-center gap-2 w-full"
                  >
                    <Share2 className="h-4 w-4" />
                    Share from this device
                  </Button>
                )}
              </div>
            </section>

            {/* Stats Grid - Enhanced with animations */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-white to-gray-50 dark:from-neutral-800 dark:to-neutral-900 p-5 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                <div className="absolute top-0 right-0 opacity-5 dark:opacity-10">
                  <Users className="h-24 w-24 text-[#ee0000]" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ee0000]/10 dark:bg-[#ee0000]/20">
                      <Users className="h-5 w-5 text-[#ee0000]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Successful Referrals</p>
                      <p className="text-3xl font-black text-gray-900 dark:text-white">{profile.successfulConversions}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Every converted friend drops 100 bonus entries into both accounts.
                  </p>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-white to-gray-50 dark:from-neutral-800 dark:to-neutral-900 p-5 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                <div className="absolute top-0 right-0 opacity-5 dark:opacity-10">
                  <Gift className="h-24 w-24 text-amber-500" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/20">
                      <Gift className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Entries Earned</p>
                      <p className="text-3xl font-black text-gray-900 dark:text-white">{profile.totalEntriesAwarded}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Keep sharing—there&apos;s no limit on how many mates you invite.
                  </p>
                </div>
              </div>
            </section>

            {/* How It Works - Enhanced with better visual hierarchy */}
            <section className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-white to-gray-50 dark:from-neutral-800 dark:to-neutral-900 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                  <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">How It Works</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 group/item">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ee0000] text-white text-xs font-bold mt-0.5">
                    1
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    Share your code or link with friends. Add a personal note—mates listen when you recommend a great deal.
                  </span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ee0000] text-white text-xs font-bold mt-0.5">
                    2
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    They join Tools Australia, enter the code in the coupon field, and subscribe or grab a one-time package.
                  </span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ee0000] text-white text-xs font-bold mt-0.5">
                    3
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    You both bank 100 bonus entries automatically—ready for the next draw.
                  </span>
                </li>
              </ul>
            </section>

            {/* Footer CTA - Enhanced with better contrast */}
            <footer className="relative overflow-hidden rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-red-950/30 p-6 shadow-sm">
              <div className="absolute top-0 right-0 opacity-10 dark:opacity-5">
                <Sparkles className="h-20 w-20 text-[#ee0000]" />
              </div>
              <div className="relative z-10">
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {userFirstName ? `Thanks ${userFirstName}!` : "Thanks!"} The fastest way to stack entries is by inviting fellow tradies.
                </p>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  Pro tip: send the link in a group chat tonight. You&apos;ll both be locked in for the next draw straight away.
                </p>
              </div>
            </footer>
          </>
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default ReferFriendModal;
