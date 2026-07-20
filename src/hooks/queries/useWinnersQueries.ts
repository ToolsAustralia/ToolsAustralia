/**
 * React Query hooks for winners data (major draw winners, etc.).
 * Shared cache: homepage, promotions page, and membership modal reuse the same data;
 * fetch runs only once and is reused until stale.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { WinnerSummary } from "@/types/winner";

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

/**
 * Shared fetch size for the combined winners feed. Both the Latest Winners board
 * and the testimony carousel MUST pass this same value so they collapse onto one
 * query key / URL / CDN entry. Sized for the carousel (which filters to winners
 * that have a written testimony); the board slices the most recent 16 client-side.
 */
export const WINNERS_FEED_LIMIT = 100;

/**
 * Combined winners feed (major + mini) from `/api/winners/all`.
 *
 * Both the Latest Winners board (needs the most recent ~16) and the testimony
 * carousel (needs a larger pool to surface enough written testimonies) render on
 * the same pages (homepage + promotions). They call this with the SAME `limit`
 * so there is ONE query key, ONE network request, and ONE CDN cache entry
 * (`/api/winners/all` serves `s-maxage=300`) — the board slices client-side.
 * Winners are historical/append-only, so 5-minute staleness is ample.
 */
export function useWinnersFeed(limit: number) {
  return useQuery({
    queryKey: queryKeys.winners.feed(limit),
    queryFn: async (): Promise<WinnerSummary[]> => {
      const data = await apiGet<{ success: boolean; winners?: WinnerSummary[] }>(
        `/api/winners/all?limit=${limit}`
      );
      if (!data.success || !Array.isArray(data.winners)) return [];
      return data.winners;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — shared across board + carousel
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true, // only fetches if no fresh cached data exists
  });
}
