/**
 * Marketing Efficiency Ratio (MER) table — one row per major draw.
 *
 * MER = New Revenue ÷ Ad Spend, where New Revenue is acquisition revenue
 * (renewals excluded). Reuses the dashboard-stats range reader for the
 * spend↔revenue join, so there is no new aggregation engine — this service only
 * enumerates draws and folds each window through computeDrawMerRow.
 *
 * Scope: starts at the draw that began 28 Apr 2026 (AEST), when payment→platform
 * attribution went live. Earlier draws have no per-platform attribution, so the
 * per-platform breakdown would be all "direct" — they are intentionally excluded.
 */
import MajorDraw from "@/models/MajorDraw";
import { readStatsForRange } from "../dashboard-stats/DashboardStatsSnapshotReader";
import { computeDrawMerRow } from "./computeDrawMer";
import type { MerDrawRow } from "@/types/admin/mer";

/**
 * First MER-eligible draw: 28 Apr 2026 00:00 AEST (UTC+10, post-DST) → 27 Apr 14:00 UTC.
 * The previous draw activated 28 Mar, so any `activationDate >= this` reliably selects
 * the 28 Apr draw and later regardless of the exact draw-time component.
 */
export const MER_TABLE_START_UTC = new Date("2026-04-27T14:00:00.000Z");

export async function getMerByDraw(): Promise<MerDrawRow[]> {
  // Most-recent draw first (the in-progress draw sits on top). Only real, dated
  // draws — exclude queued/cancelled and any legacy draw missing its window.
  const draws = await MajorDraw.find({
    activationDate: { $gte: MER_TABLE_START_UTC },
    drawDate: { $exists: true },
    status: { $in: ["active", "frozen", "completed"] },
  })
    .sort({ drawDate: -1 })
    .select("name activationDate drawDate status")
    .lean();

  const usable = draws.filter((d) => d.activationDate && d.drawDate);

  /**
   * Bounded concurrency, not a sequential loop.
   *
   * This used to be `for…of` with an `await` inside, so N draws cost N round-trip groups in
   * series — and N grows by one every month, which is how a route slides into a timeout with no
   * code change. Same chunked pattern the snapshot reader already uses for live days.
   *
   * POOL_SIZE 4, not 8: mongoose is configured with `maxPoolSize: 5`, so a wider pool just
   * queues on the connection pool while holding more memory.
   */
  const POOL_SIZE = 4;
  const rows: MerDrawRow[] = new Array(usable.length);

  for (let i = 0; i < usable.length; i += POOL_SIZE) {
    const chunk = usable.slice(i, i + POOL_SIZE);
    await Promise.all(
      chunk.map(async (d, j) => {
        const activation = new Date(d.activationDate as string | Date);
        const drawDate = new Date(d.drawDate as string | Date);
        const inProgress = d.status === "active" || d.status === "frozen";

        // readStatsForRange enumerates whole AEST days and stops at "today", so passing a
        // future drawDate (the in-progress draw) is safe — it computes up to today live.
        //
        // `includeDistinctUserCounts: false`: that aggregation fills `revenue.buckets[].userCount`,
        // which nothing below reads. It was N discarded $lookup self-joins per request.
        const stats = await readStatsForRange({
          rangeStartUTC: activation,
          rangeEndUTC: drawDate,
          includeDistinctUserCounts: false,
        });

        // Write BY INDEX — the caller's most-recent-first order comes from the .sort() above and
        // must survive; pushing from a pool would interleave by completion time.
        rows[i + j] = computeDrawMerRow({
          draw: {
            drawId: String(d._id),
            drawName: d.name,
            periodStart: activation.toISOString(),
            periodEnd: drawDate.toISOString(),
            inProgress,
          },
          adChannels: stats.adChannels,
          attributedRevenue: stats.attributedRevenue,
        });
      })
    );
  }

  return rows;
}
