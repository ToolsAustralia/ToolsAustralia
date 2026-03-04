"use client";

import { useMemo } from "react";
import {
  useCompletedMajorDraws,
  useUserMajorDrawEntries,
} from "@/hooks/queries/useMajorDrawQueries";
import type { PastDrawWithUserEntries } from "@/components/modals/past-draws/types";

interface UsePastDrawsDataReturn {
  draws: PastDrawWithUserEntries[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Aggregates user entry counts by major draw ID.
 * The user-entries API returns one row per source (membership, one-time, etc.),
 * so we sum them into a single count per draw.
 */
function aggregateEntriesByDraw(
  entries: Array<{ majorDrawId?: string; entryCount?: number }>
): Map<string, number> {
  const map = new Map<string, number>();

  for (const entry of entries) {
    const id = entry.majorDrawId;
    if (!id) continue;
    const count = entry.entryCount ?? 0;
    map.set(id, (map.get(id) ?? 0) + count);
  }

  return map;
}

/**
 * Custom hook that fetches completed major draws and the current user's
 * entries, then merges them into a list of draws the user participated in.
 *
 * Encapsulates all data fetching and transformation — no UI concern.
 */
export function usePastDrawsData(userId?: string): UsePastDrawsDataReturn {
  const {
    data: completedData,
    isLoading: completedLoading,
    error: completedError,
  } = useCompletedMajorDraws();

  const {
    data: userEntries,
    isLoading: entriesLoading,
    error: entriesError,
  } = useUserMajorDrawEntries(userId);

  const draws = useMemo<PastDrawWithUserEntries[]>(() => {
    const completedDraws = completedData?.draws;
    if (!completedDraws || !userEntries) return [];

    const entriesByDraw = aggregateEntriesByDraw(
      userEntries as unknown as Array<{
        majorDrawId?: string;
        entryCount?: number;
      }>
    );

    return completedDraws
      .filter((draw) => entriesByDraw.has(draw._id))
      .map((draw) => ({
        _id: draw._id,
        name: draw.name,
        description: draw.description,
        prize: draw.prize,
        drawDate: draw.drawDate,
        totalEntries: draw.totalEntries,
        participantCount: draw.participantCount,
        winner: draw.winner as PastDrawWithUserEntries["winner"],
        userEntryCount: entriesByDraw.get(draw._id) ?? 0,
      }));
  }, [completedData, userEntries]);

  return {
    draws,
    isLoading: completedLoading || entriesLoading,
    error: (completedError ?? entriesError) as Error | null,
  };
}
