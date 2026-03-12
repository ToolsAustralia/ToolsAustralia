"use client";

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import MiniDrawCard, { type MiniDrawCardData } from "@/components/features/MiniDrawCard";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { type MiniDrawType as ReactQueryMiniDraw } from "@/types/mini-draw";
import { SectionContainer } from "@/components/ui";

export default function HomeMiniDraws() {
  const {
    data: miniDrawsData,
    isLoading,
    error,
  } = useMiniDraws({
    page: 1,
    limit: 4,
    status: "active",
    sortBy: "displayOrder",
    sortOrder: "asc",
  });

  const transformedMiniDraws: MiniDrawCardData[] =
    miniDrawsData?.miniDraws?.map(
      (
        miniDraw: ReactQueryMiniDraw & {
          entriesRemaining?: number;
        }
      ) => {
        const totalEntries = miniDraw.totalEntries || 0;
        const minimumEntries = miniDraw.minimumEntries || 0;
        const entriesRemaining =
          miniDraw.entriesRemaining !== undefined
            ? miniDraw.entriesRemaining
            : Math.max(minimumEntries - totalEntries, 0);

        return {
          _id: miniDraw._id,
          name: miniDraw.name,
          status: miniDraw.status as "active" | "completed" | "cancelled",
          totalEntries,
          minimumEntries,
          entriesRemaining,
          brandId: miniDraw.brandId,
          prize: {
            name: miniDraw.prize.name,
            value: miniDraw.prize.value,
            images: miniDraw.prize.images || [],
          },
        };
      }
    ) || [];

  if (isLoading) {
    return (
      <section className="pb-12 sm:pb-16 lg:pb-20 bg-white w-full overflow-hidden">
        <SectionContainer>
          <div className="flex items-center justify-center gap-3 mb-6 sm:mb-8">
            <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse" />
            <div className="h-7 w-32 bg-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-3 sm:p-4 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-16" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-1.5 bg-gray-200 rounded-full w-full" />
                  <div className="h-9 bg-gray-200 rounded-full w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        </SectionContainer>
      </section>
    );
  }

  if (error || transformedMiniDraws.length === 0) {
    return null;
  }

  return (
    <section className="pb-12 sm:pb-16 lg:pb-20 bg-white w-full overflow-hidden">
      <SectionContainer>
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#ee0000] to-[#cc0000] flex items-center justify-center shadow-lg shadow-[#ee0000]/20">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Mini Draws
            </h2>
          </div>
          <Link
            href="/mini-draws"
            className="flex items-center gap-1 text-sm font-semibold text-[#ee0000] hover:text-[#cc0000] transition-colors"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mini Draws Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {transformedMiniDraws.map((miniDraw, i) => (
            <MiniDrawCard key={miniDraw._id} miniDraw={miniDraw} index={i} />
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
