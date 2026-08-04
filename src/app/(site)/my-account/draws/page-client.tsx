"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete — user review pending; see
// docs/superpowers/specs/2026-07-02-dashboard-draws-design.md):
//   Removed from THIS page but KEPT (shared, used elsewhere): PrizeShowcase,
//   MembershipSection, LatestWinnerHero, WinnersTestimony, MajorDrawHeaderStrip.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import Seg from "@/components/ui/Seg";
import EntryWallet from "@/components/sections/dashboard/EntryWallet";
import DrawsMajorHero from "@/components/sections/draws/DrawsMajorHero";
import DrawHowItWorks from "@/components/sections/draws/DrawHowItWorks";
import DrawWinners from "@/components/sections/draws/DrawWinners";
import DrawsMini from "@/components/sections/draws/DrawsMini";
import DashboardLoader from "@/components/loading/DashboardLoader";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";

type DrawType = "major" | "mini";

export default function DrawsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const { openEntryFlow, membershipModal } = useMajorDrawEntryCta();
  const [drawType, setDrawType] = useState<DrawType>("major");

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return <DashboardLoader />;
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to view the draws.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">Sign In</Link>
      </div>
    );
  }

  const participation = (dash.user as unknown as { miniDrawParticipation?: Array<{ miniDrawId: unknown; totalEntries: number }> })
    ?.miniDrawParticipation;

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      {/* draw-type toggle bar (prototype uses this instead of a colored PageHeader) */}
      <div className="flex items-center gap-2.5 border-b border-token bg-surface px-[18px] py-3.5 sm:px-6 lg:px-[26px]">
        <span className="font-poppins text-base font-extrabold text-primary-token dark:text-white">Draws</span>
        <div className="ml-auto">
          <Seg
            value={drawType}
            onChange={setDrawType}
            options={[
              { value: "major", label: "Major draw", shortLabel: "Major" },
              { value: "mini", label: "Mini draws", shortLabel: "Mini" },
            ]}
          />
        </div>
      </div>

      {drawType === "major" ? (
        <>
          <DrawsMajorHero />
          <div className="px-[18px] pb-2 pt-4 sm:px-6 lg:px-[26px]">
            <div className="space-y-4">
              {dash.acct !== "none" && (
                <EntryWallet
                  acct={dash.acct}
                  entries={{ membership: dash.entries.membership, oneTime: dash.entries.oneTime, streak: dash.entries.streak }}
                  tierHex={dash.tierHex}
                  drawName={dash.drawName}
                  drawDateIso={dash.drawDateIso}
                  drawStatus={dash.drawStatus}
                  stack
                  eyebrow="Your entries"
                  onGetPackage={() => openEntryFlow()}
                  multiplier={dash.multiplier}
                  hasAdditionalAccess={dash.hasAdditionalAccess}
                  renewalDateIso={dash.renewalDateIso}
                  entriesPerRenewal={dash.membershipEntriesPerRenewal}
                />
              )}
              <DrawHowItWorks />
              <DrawWinners />
            </div>
          </div>
        </>
      ) : (
        <div className="px-[18px] pt-4 sm:px-6 lg:px-[26px]">
          <DrawsMini participation={participation} hasActiveMembership={dash.acct === "active"} />
        </div>
      )}

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined}
        planIsDefaultSelection={membershipModal.openWithPackageSelectionFirst}
      />
    </div>
  );
}
