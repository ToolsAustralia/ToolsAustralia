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

  const rows: MerDrawRow[] = [];
  for (const d of draws) {
    const activation = d.activationDate ? new Date(d.activationDate) : null;
    const drawDate = d.drawDate ? new Date(d.drawDate) : null;
    if (!activation || !drawDate) continue;

    const inProgress = d.status === "active" || d.status === "frozen";

    // readStatsForRange enumerates whole AEST days and stops at "today", so passing a
    // future drawDate (the in-progress draw) is safe — it computes up to today live.
    const stats = await readStatsForRange({ rangeStartUTC: activation, rangeEndUTC: drawDate });

    rows.push(
      computeDrawMerRow({
        draw: {
          drawId: String(d._id),
          drawName: d.name,
          periodStart: activation.toISOString(),
          periodEnd: drawDate.toISOString(),
          inProgress,
        },
        adChannels: stats.adChannels,
        attributedRevenue: stats.attributedRevenue,
      })
    );
  }

  return rows;
}
