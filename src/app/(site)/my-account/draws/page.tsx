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
import { Ticket, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import Seg from "@/components/ui/Seg";
import DashboardPageHeader from "../components/DashboardPageHeader";
import EntryWallet from "@/components/sections/dashboard/EntryWallet";
import DashboardPromoBanner from "@/components/sections/dashboard/DashboardPromoBanner";
import DrawsMajorHero from "@/components/sections/draws/DrawsMajorHero";
import DrawHowItWorks from "@/components/sections/draws/DrawHowItWorks";
import DrawWinners from "@/components/sections/draws/DrawWinners";
import DrawsMini from "@/components/sections/draws/DrawsMini";

const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

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
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
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
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader title="Draws" sub="Major draw & mini draws" icon={Ticket} stateTheme={dash.stateTheme} showBack />

      <div className="space-y-4 px-4 pt-4 sm:px-6">
        <div className="flex justify-center">
          <Seg
            value={drawType}
            onChange={setDrawType}
            options={[
              { value: "major", label: "Major draw", shortLabel: "Major" },
              { value: "mini", label: "Mini draws", shortLabel: "Mini" },
            ]}
          />
        </div>

        {drawType === "major" ? (
          <>
            <DrawsMajorHero drawName={dash.drawName} drawDateIso={dash.drawDateIso} drawStatus={dash.drawStatus} />
            {dash.acct !== "none" && (
              <EntryWallet
                acct={dash.acct}
                entries={dash.entries}
                tierHex={dash.tierHex}
                drawName={dash.drawName}
                drawDateIso={dash.drawDateIso}
                drawStatus={dash.drawStatus}
                onResolvePayment={() => router.push("/my-account/settings?tab=subscription")}
              />
            )}
            <DashboardPromoBanner multiplier={dash.multiplier} onGetPackage={() => openEntryFlow()} />
            <button
              type="button"
              onClick={() => openEntryFlow()}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 py-3.5 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
            >
              Get more entries <ArrowRight className="h-4 w-4" />
            </button>
            <DrawHowItWorks />
            <DrawWinners />
          </>
        ) : (
          <DrawsMini participation={participation} hasActiveMembership={dash.acct === "active"} />
        )}
      </div>

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined}
      />
    </div>
  );
}
