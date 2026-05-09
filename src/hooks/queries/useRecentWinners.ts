"use client";

/**
 * React Query hook for the homepage `RecentWinnersCarousel` recent-winners list.
 *
 * Source endpoint: GET /api/winners/all?limit=<n> (returns major + mini winners
 * merged and sorted by selectedDate desc). Shape mirrors `WinnerSummary` from
 * `src/types/winner.ts` but only the fields the carousel renders are typed here
 * to keep the public hook surface narrow.
 *
 * Cache: shared across any caller using the same `limit`. We deliberately scope
 * the query key by limit so a `limit=12` carousel and a `limit=100` listing do
 * not overwrite each other.
 */

import { useQuery } from "@tanstack/react-query";

interface RecentWinner {
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
  wonOnDate?: string;
  entryNumber?: number;
  selectedPrize?: string;
}

interface ApiResponse {
  success: boolean;
  winners?: RecentWinner[];
}

async function fetchRecentWinners(limit: number): Promise<RecentWinner[]> {
  const res = await fetch(`/api/winners/all?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as ApiResponse;
  if (!data.success || !data.winners) return [];
  return data.winners;
}

export function useRecentWinners(limit = 12) {
  return useQuery({
    queryKey: ["recent-winners", { limit }],
    queryFn: () => fetchRecentWinners(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  });
}

export type { RecentWinner };
