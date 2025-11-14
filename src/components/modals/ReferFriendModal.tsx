"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, LinkIcon, Sparkles, Users, Share2 } from "lucide-react";
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
        subtitle="Share your code. When your friend subscribes or buys a one-time package and verifies their email, you both pocket 100 bonus entries."
        onClose={onCloseAction}
        showLogo
      />

      <ModalContent className="space-y-6">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ee0000]/10">
            <Sparkles className="h-5 w-5 text-[#ee0000]" />
          </div>
          <div className="text-sm text-gray-700">
            Invite a mate, and you both score 100 bonus entries once they complete their first membership or one-time
            package purchase and verify their email.
          </div>
        </div>

        {isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
            Fetching your personal referral code...
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">We hit a snag loading your code.</p>
            <p className="mt-1">
              Please try again or contact support if the problem continues.{" "}
              <button
                onClick={() => refetch()}
                className="text-red-600 underline underline-offset-2 hover:text-red-500"
                type="button"
              >
                Retry now
              </button>
            </p>
          </div>
        )}

        {profile && (
          <>
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700">Your Referral Code</h3>
              <p className="mt-1 text-xs text-gray-500">
                Share this code with your mates. It never expires and always belongs to you.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-2xl font-bold tracking-widest text-gray-900">{profile.code}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(profile.code, "code")}
                    className="flex items-center gap-2 text-sm font-semibold text-[#ee0000] hover:text-red-600"
                  >
                    <Copy className="h-4 w-4" />
                    {copyStatus === "code" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700">Share your invite link</h3>
              <p className="mt-1 text-xs text-gray-500">
                Skip the manual typing—send the link and their code is pre-filled at checkout.
              </p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="truncate text-sm font-medium text-gray-700">{shareLink}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(shareLink, "link")}
                    className="flex items-center gap-2 text-sm font-semibold text-[#ee0000] hover:text-red-600"
                  >
                    <LinkIcon className="h-4 w-4" />
                    {copyStatus === "link" ? "Copied!" : "Copy"}
                  </button>
                </div>

                {shareSupported && (
                  <Button
                    onClick={handleShare}
                    variant="primary"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <Share2 className="h-4 w-4" />
                    Share from this device
                  </Button>
                )}
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <Users className="h-6 w-6 text-[#ee0000]" />
                  <div>
                    <p className="text-xs uppercase text-gray-500">Successful referrals</p>
                    <p className="text-2xl font-bold text-gray-900">{profile.successfulConversions}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Every converted friend drops 100 bonus entries into both accounts.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <Gift className="h-6 w-6 text-[#ee0000]" />
                  <div>
                    <p className="text-xs uppercase text-gray-500">Entries earned so far</p>
                    <p className="text-2xl font-bold text-gray-900">{profile.totalEntriesAwarded}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Keep sharing—there’s no limit on how many mates you invite.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700">How it works</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#ee0000]" aria-hidden />
                  <span>
                    Share your code or link with friends. Add a personal note—mates listen when you recommend a great
                    deal.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#ee0000]" aria-hidden />
                  <span>
                    They join Tools Australia, enter the code in the coupon field, subscribe or grab a one-time package,
                    and confirm their email.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#ee0000]" aria-hidden />
                  <span>You both bank 100 bonus entries automatically—ready for the next draw.</span>
                </li>
              </ul>
            </section>

            <footer className="rounded-2xl border border-gray-100 bg-gradient-to-r from-[#ee0000]/10 to-amber-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800">
                {userFirstName ? `Thanks ${userFirstName}!` : "Thanks!"} The fastest way to stack entries is by inviting
                fellow tradies.
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Pro tip: send the link in a group chat tonight. You’ll both be locked in for the next draw straight
                away.
              </p>
            </footer>
          </>
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default ReferFriendModal;
