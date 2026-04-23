import MajorDraw from "@/models/MajorDraw";

type DrawEntry = {
  userId: { toString: () => string } | string;
  totalEntries?: number;
  quantity?: number;
};

/**
 * Compute user IDs in the top `percent` of unique participants by total entries
 * in the active major draw (ties at the threshold included), matching export logic.
 */
export function computeTopPercentileUserIdsFromEntries(entries: DrawEntry[], percent: number): string[] {
  const pct = Math.min(100, Math.max(1, percent));
  const countMap = new Map<string, number>();
  for (const entry of entries) {
    const userId = typeof entry.userId === "string" ? entry.userId : entry.userId.toString();
    const count = entry.totalEntries || entry.quantity || 0;
    if (count > 0) {
      countMap.set(userId, (countMap.get(userId) || 0) + count);
    }
  }
  const entryCounts = Array.from(countMap.entries()).map(([userId, count]) => ({ userId, count }));
  entryCounts.sort((a, b) => b.count - a.count);
  if (entryCounts.length === 0) return [];

  const takeCount = Math.max(1, Math.ceil(entryCounts.length * (pct / 100)));
  const thresholdCount = entryCounts[takeCount - 1]!.count;
  return entryCounts.filter((e) => e.count >= thresholdCount).map((e) => e.userId);
}

/** User IDs in the top `percent` for the current active major draw. Empty if none. */
export async function loadTopMajorDrawPercentileUserIds(percent: number): Promise<string[]> {
  const draw = await MajorDraw.findOne({ status: "active" }).select("entries").lean();
  const entries = draw?.entries as DrawEntry[] | undefined;
  if (!entries?.length) return [];
  return computeTopPercentileUserIdsFromEntries(entries, percent);
}
