"use client";

import Link from "next/link";
import ProductCard from "@/components/ui/ProductCard";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import { type MiniDrawType as ReactQueryMiniDraw } from "@/types/mini-draw";

// Mini draw type for ProductCard compatibility (entry-based system)
interface MiniDrawForCard {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  requiresMembership: boolean;
  hasActiveMembership?: boolean;
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

export default function HomeMiniDraws() {
  // Fetch active mini draws using React Query hook
  const {
    data: miniDrawsData,
    isLoading,
    error,
  } = useMiniDraws({
    page: 1,
    limit: 4, // Show 4 mini draws on home page
    status: "active", // Only show active mini draws
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Transform React Query mini draws to match ProductCard's MiniDrawType interface
  const transformedMiniDraws: MiniDrawForCard[] =
    miniDrawsData?.miniDraws?.map(
      (
        miniDraw: ReactQueryMiniDraw & {
          requiresMembership?: boolean;
          hasActiveMembership?: boolean;
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
          requiresMembership: miniDraw.requiresMembership ?? true,
          hasActiveMembership: miniDraw.hasActiveMembership ?? false,
          prize: {
            name: miniDraw.prize.name,
            value: miniDraw.prize.value,
            images: miniDraw.prize.images || [],
          },
        };
      }
    ) || [];

  // Show loading state
  if (isLoading) {
    return (
      <section className="pb-12 sm:pb-16 lg:pb-20 bg-white w-full overflow-hidden">
        <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
          <div className="text-center">
            <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">
              MINI DRAWS
            </div>
            <div className="text-gray-500">Loading mini draws...</div>
          </div>
        </div>
      </section>
    );
  }

  // Hide section if there's an error or no mini draws
  if (error || transformedMiniDraws.length === 0) {
    return null;
  }

  return (
    <section className="pb-12 sm:pb-16 lg:pb-20 bg-white w-full overflow-hidden">
      <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">MINI DRAWS</h2>
        </div>

        {/* Mini Draws Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {transformedMiniDraws.map((miniDraw) => (
            <ProductCard key={miniDraw._id} product={miniDraw} width="w-full" viewMode="grid" />
          ))}
        </div>

        {/* View All Link */}
        <div className="text-center mt-6 sm:mt-8">
          <Link
            href="/mini-draws"
            className="inline-block text-red-600 hover:text-red-700 font-semibold text-sm sm:text-base transition-colors underline-offset-2 hover:underline"
          >
            View All Mini Draws →
          </Link>
        </div>
      </div>
    </section>
  );
}
