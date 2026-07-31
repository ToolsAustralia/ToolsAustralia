// src/services/admin/drawRevenue.ts
//
// Per-major-draw NET REVENUE.
//
// There is no revenue field on the MajorDraw model and there never has been — the
// admin draws design calls for it in eight places (ribbon stat, two KPI strips, a
// table column, a per-entry sub-line, group meta lines, the inspector, and a sort
// option), so it is derived here from PaymentEvent.
//
// ── The window rule ────────────────────────────────────────────────────────────
// A draw's revenue must cover exactly the payments whose ENTRIES landed in that
// draw, or the figure contradicts the entry count sitting next to it.
//
// getTargetMajorDraw (src/utils/draws/major-draw-helpers.ts) routes a payment by
// its creation time: before the active draw's freezeEntriesAt it enters that draw;
// at or after it, the entry is deferred to the next queued draw. So the matching
// window is
//
//     [ previousDraw.freezeEntriesAt , thisDraw.freezeEntriesAt )
//
// Chaining off the PREVIOUS freeze rather than this draw's own activationDate is
// load-bearing: between one draw freezing (e.g. 27th 20:00) and the next
// activating (28th 00:00) there is a gap period whose payments getTargetMajorDraw
// sends to the next queued draw. An activation-based window would drop that money
// on the floor. The chained window absorbs it.
//
// KEEP THIS IN LOCKSTEP WITH getTargetMajorDraw. If the routing rule changes, this
// window changes with it or the two figures silently diverge.
//
// ── Units and refunds ──────────────────────────────────────────────────────────
// PaymentEvent.data.price is in DOLLARS (application convention — see
// src/utils/payment/payment-event-net-queries.ts, where RefundProcessed.refundAmount
// is in cents and is therefore never mixed into a sum). "Net" means whole
// BenefitsGranted rows are excluded when a RefundProcessed exists for the same
// paymentIntentId; that exclusion happens in the shared fetch helper, not here.

import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";

/** The date fields this module needs off a draw. Accepts lean/JSON reads. */
export type DrawWindowInput = {
  _id: string;
  activationDate?: Date | string | null;
  freezeEntriesAt?: Date | string | null;
  drawDate?: Date | string | null;
};

/** A half-open `[start, end)` revenue window for one draw. */
export type DrawRevenueWindow = {
  drawId: string;
  start: Date;
  end: Date;
};

/** Lean projection of a net BenefitsGranted row. */
export type LeanRevenueRow = {
  timestamp?: Date | string;
  data?: { price?: number };
};

/** Parse to a valid Date, or null. Never returns an Invalid Date. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Build contiguous, non-overlapping revenue windows for a set of draws.
 *
 * Pure. Draws with no usable end boundary are DROPPED rather than producing an
 * Invalid Date window — an Invalid Date compares false against everything, so it
 * would silently swallow or discard rows depending on which way the comparison
 * fell.
 */
export function buildDrawRevenueWindows(draws: DrawWindowInput[]): DrawRevenueWindow[] {
  const dated = draws
    .map((draw) => ({
      drawId: String(draw._id),
      // freezeEntriesAt is the real routing boundary. drawDate is the fallback for
      // legacy rows written before the freeze field existed.
      end: toDate(draw.freezeEntriesAt) ?? toDate(draw.drawDate),
      activation: toDate(draw.activationDate),
    }))
    .filter((entry): entry is { drawId: string; end: Date; activation: Date | null } => entry.end !== null)
    .sort((a, b) => a.end.getTime() - b.end.getTime());

  const windows: DrawRevenueWindow[] = [];
  for (let i = 0; i < dated.length; i++) {
    const current = dated[i];
    const previous = i > 0 ? dated[i - 1] : null;
    // Chain off the previous freeze. The earliest draw in the set has no
    // predecessor, so it uses its own activation; with neither, the window opens
    // at the epoch and collects everything before its freeze.
    const start = previous ? previous.end : (current.activation ?? new Date(0));
    if (start.getTime() >= current.end.getTime()) continue; // degenerate — skip
    windows.push({ drawId: current.drawId, start, end: current.end });
  }
  return windows;
}

/**
 * Sum event prices into their window. Pure, zero-filled, half-open `[start, end)`.
 *
 * Windows are contiguous and ascending, so each event is placed by binary search —
 * correct even when the caller hands us unsorted events.
 */
export function assignRevenueToWindows(
  events: LeanRevenueRow[],
  windows: DrawRevenueWindow[]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const window of windows) totals.set(window.drawId, 0);
  if (windows.length === 0) return totals;

  for (const event of events) {
    const timestamp = toDate(event.timestamp);
    if (!timestamp) continue;
    const time = timestamp.getTime();

    let lo = 0;
    let hi = windows.length - 1;
    let hit: DrawRevenueWindow | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const window = windows[mid];
      if (time < window.start.getTime()) hi = mid - 1;
      else if (time >= window.end.getTime()) lo = mid + 1;
      else {
        hit = window;
        break;
      }
    }
    // Outside every window — e.g. before the earliest draw opened. Not an error.
    if (!hit) continue;

    totals.set(hit.drawId, (totals.get(hit.drawId) ?? 0) + (event.data?.price ?? 0));
  }
  return totals;
}

/**
 * Net revenue per draw, zero-filled for every draw that produced a window.
 *
 * ONE aggregation for the whole set: the windows are contiguous, so a single
 * `[earliest.start, latest.end)` fetch covers all of them and the bucketing happens
 * in memory. Do NOT call this per draw — that turns a page render into N
 * aggregations over the same collection.
 */
export async function getRevenueByDraw(draws: DrawWindowInput[]): Promise<Map<string, number>> {
  const windows = buildDrawRevenueWindows(draws);
  if (windows.length === 0) return new Map();

  const rangeStart = windows[0].start;
  const rangeEnd = windows[windows.length - 1].end;

  const events = (await fetchNetBenefitsGrantedWithMatch(
    { timestamp: { $gte: rangeStart, $lt: rangeEnd } },
    { timestamp: 1, "data.price": 1 }
  )) as LeanRevenueRow[];

  return assignRevenueToWindows(events, windows);
}
