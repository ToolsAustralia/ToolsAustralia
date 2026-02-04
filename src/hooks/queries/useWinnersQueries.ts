/**
 * React Query hooks for winners data (major draw winners, etc.).
 * Shared cache: homepage, promotions page, and membership modal reuse the same data;
 * fetch runs only once and is reused until stale.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";

export interface MajorDrawWinner {
  id: string;
  drawId: string;
  drawName: string;
  drawType: "major";
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
  entryNumber?: number;
  /** Winner's selected prize (major draws) - free-form text from Winner model */
  selectedPrize?: string;
  /** Major draw date (when the draw was held), from MajorDraw.drawDate */
  drawDate?: string;
}

const FETCH_LIMIT = 10;

/**
 * Fetches major draw winners. Single shared cache for homepage, promotions page,
 * and membership modal; only one API call is made and data is reused until stale.
 */
export function useMajorDrawWinners() {
  return useQuery({
    queryKey: queryKeys.winners.majorDraws,
    queryFn: async (): Promise<MajorDrawWinner[]> => {
      const data = await apiGet<{ success: boolean; winners?: MajorDrawWinner[] }>(
        `/api/winners/major-draws?limit=${FETCH_LIMIT}`
      );
      if (!data.success || !Array.isArray(data.winners)) return [];
      return data.winners;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - reuse across pages/modal
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true, // fetch on mount only if no cached data yet
  });
}
