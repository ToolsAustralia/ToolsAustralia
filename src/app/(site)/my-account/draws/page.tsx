"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import MembershipSection from "@/components/sections/MembershipSection";
import PrizeShowcase from "@/components/sections/promo/PrizeShowcase";
import LatestWinnerHero from "@/components/sections/LatestWinnerHero";
import WinnerTestimonySection from "@/components/sections/WinnerTestimonySection";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { CheckCircle, Sparkles, Trophy, ChevronRight, Ticket } from "lucide-react";
import MiniDrawCard, { type MiniDrawCardData } from "@/components/features/MiniDrawCard";

import DashboardHeader from "../components/DashboardHeader";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";

export default function DrawsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading } = useMyAccountData(session?.user?.id);

  const { data: miniDrawsData, isLoading: miniDrawsLoading } = useMiniDraws({
    page: 1,
    limit: 8,
    status: "active",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [winners, setWinners] = React.useState<
    Array<{
      id: string;
      drawId: string;
      drawName: string;
      drawType: "major" | "mini";
      prize: {
        name: string;
        description: string;
        value: number;
        images: string[];
      };
      winnerFirstName: string;
      winnerLastName: string;
      winnerState?: string;
      imageUrl?: string;
      selectedDate: string;
      testimony?: string;
      selectedPrize?: string;
      cycle: number;
    }>
  >([]);
  const [winnersLoading, setWinnersLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchWinners = async () => {
      try {
        const response = await fetch("/api/winners/all?limit=100");
        const data = await response.json();

        if (data.success && data.winners) {
          setWinners(data.winners);
        }
      } catch (error) {
        console.error("Error fetching winners:", error);
      } finally {
        setWinnersLoading(false);
      }
    };

    fetchWinners();
  }, []);

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !accountData) {
    return null;
  }

  const { user } = accountData;
  const hasActiveMembership = user?.subscription?.isActive === true;

  const userWithParticipation = user as unknown as {
    miniDrawParticipation?: Array<{
      miniDrawId: unknown;
      totalEntries: number;
    }>;
  };

  const userParticipatingMiniDrawIds = new Set(
    (userWithParticipation?.miniDrawParticipation || [])
      .filter((p) => p.totalEntries > 0)
      .map((p) => {
        const miniDrawId = p.miniDrawId;
        if (typeof miniDrawId === "string") {
          return miniDrawId;
        }
        if (miniDrawId && typeof miniDrawId === "object") {
          if ("toString" in miniDrawId && typeof (miniDrawId as { toString: () => string }).toString === "function") {
            return (miniDrawId as { toString: () => string }).toString();
          }
          if ("_id" in miniDrawId) {
            const idValue = (miniDrawId as { _id: unknown })._id;
            if (typeof idValue === "string") {
              return idValue;
            }
            if (idValue && typeof idValue === "object" && "toString" in idValue) {
              return (idValue as { toString: () => string }).toString();
            }
          }
        }
        return "";
      })
      .filter((id) => id !== "")
  );

  const allActiveMiniDraws = (miniDrawsData?.miniDraws || []).map((miniDraw) => {
    const totalEntries = miniDraw.totalEntries || 0;
    const minimumEntries = miniDraw.minimumEntries || 0;
    const entriesRemaining =
      miniDraw.entriesRemaining !== undefined ? miniDraw.entriesRemaining : Math.max(minimumEntries - totalEntries, 0);

    const miniDrawId =
      typeof miniDraw._id === "string"
        ? miniDraw._id
        : miniDraw._id && typeof miniDraw._id === "object" && "toString" in miniDraw._id
          ? (miniDraw._id as { toString: () => string }).toString()
          : String(miniDraw._id);
    const isParticipant = userParticipatingMiniDrawIds.has(miniDrawId);

    return {
      ...miniDraw,
      totalEntries,
      minimumEntries,
      entriesRemaining,
      requiresMembership: false,
      hasActiveMembership,
      isParticipant,
    };
  });

  const participantMiniDraws = allActiveMiniDraws.filter((draw) => draw.isParticipant);
  const otherMiniDraws = allActiveMiniDraws.filter((draw) => !draw.isParticipant);
  const activeMiniDraws = [...participantMiniDraws, ...otherMiniDraws];
  const hasMiniPackEntries = userParticipatingMiniDrawIds.size > 0;

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950">
      <DashboardHeader title="Draws" showRenewalAlert={hasFailedRenewal(user as unknown as import("@/models/User").IUser)} />

      <div className="max-w-7xl mx-auto">
        <div>
          <PrizeShowcase />
        </div>

        <div>
          <MembershipSection title="BOOST YOUR ODDS 50%" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-6 sm:pb-8 space-y-6 sm:space-y-8">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 xs:w-10 xs:h-10 rounded-xl bg-gradient-to-br from-[#ee0000] to-[#cc0000] dark:from-red-600 dark:to-red-700 flex items-center justify-center shadow-lg shadow-[#ee0000]/20">
                <Trophy className="w-4 h-4 xs:w-5 xs:h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Mini Draws</h2>
                <p className="text-[10px] xs:text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Win premium tools &amp; gear from $1 per entry
                </p>
              </div>
            </div>
            <Link
              href="/mini-draws"
              className="hidden sm:flex items-center gap-1 text-sm font-semibold text-[#ee0000] dark:text-red-500 hover:text-[#cc0000] dark:hover:text-red-400 transition-colors"
            >
              View All
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {!miniDrawsLoading && activeMiniDraws.length > 0 && (
            <div className="mb-4 sm:mb-6">
              {hasMiniPackEntries ? (
                <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-xl p-3 sm:p-4">
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                      You&apos;re entered in active mini draws
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      Mini pack entries count toward mini draws only — membership entries apply to the Major Giveaway.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-900 to-slate-900 dark:from-neutral-900 dark:to-neutral-950 rounded-xl p-3 sm:p-4 border border-gray-800 dark:border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                        <Ticket className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Get your name in the draw</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Purchase a mini pack to enter — from just $1
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/mini-draws"
                      className="inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#ee0000] to-[#cc0000] hover:from-[#dd0000] hover:to-[#bb0000] text-white text-sm font-bold py-2.5 px-5 rounded-lg transition-all duration-200 shadow-lg shadow-[#ee0000]/25 flex-shrink-0"
                    >
                      Browse Mini Packs
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {miniDrawsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200 dark:bg-neutral-800" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-16" />
                    <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-3/4" />
                    <div className="h-1.5 bg-gray-200 dark:bg-neutral-800 rounded-full w-full" />
                    <div className="h-9 bg-gray-200 dark:bg-neutral-800 rounded-full w-full mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeMiniDraws.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center">
                <Trophy className="w-7 h-7 text-gray-400 dark:text-gray-600" />
              </div>
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">No active mini draws right now</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Check back soon for new draws!</p>
            </div>
          ) : (
            <>
              {participantMiniDraws.length > 0 && otherMiniDraws.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-green-600 dark:text-green-500" />
                    Your Active Draws
                  </h3>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {participantMiniDraws.map((miniDraw, i) => (
                  <MiniDrawCard key={miniDraw._id} miniDraw={miniDraw as MiniDrawCardData} index={i} />
                ))}
              </div>

              {otherMiniDraws.length > 0 && (
                <>
                  {participantMiniDraws.length > 0 && (
                    <div className="mt-6 sm:mt-8 mb-3 sm:mb-4">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#ee0000] dark:text-red-500" />
                        {hasMiniPackEntries ? "Enter More Draws" : "Explore Mini Draws"}
                      </h3>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {otherMiniDraws.map((miniDraw, i) => (
                      <MiniDrawCard key={miniDraw._id} miniDraw={miniDraw as MiniDrawCardData} index={i} />
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 sm:hidden text-center">
                <Link
                  href="/mini-draws"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#ee0000] dark:text-red-500"
                >
                  View All Mini Draws
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          )}
        </div>

        <LatestWinnerHero className="mb-6 sm:mb-8 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-6 sm:pb-8 space-y-6 sm:space-y-8" />

        {!winnersLoading && winners.length > 0 && (
          <WinnerTestimonySection winners={winners} className="mb-6 sm:mb-8" />
        )}
      </div>
    </div>
  );
}
