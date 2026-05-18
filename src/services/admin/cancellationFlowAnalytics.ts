import type { FilterQuery } from "mongoose";
import connectDB from "@/lib/mongodb";
import CancellationFlowEvent, {
  CANCELLATION_REASONS,
  OFFER_TYPES,
  type CancellationReason,
  type OfferType,
  type ICancellationFlowEvent,
} from "@/models/CancellationFlowEvent";

const ONE_HOUR_MS = 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Per-reason breakdown row. */
export interface ReasonBreakdown {
  count: number;
  /** Share of total triggered events, 0–100. 0 when there are no events. */
  sharePct: number;
}

export interface CancellationFunnel {
  /** Every event reaches the reason step (a reason is required to start). */
  reachedReason: number;
  /** Events that were shown at least one offer and were not past-due. */
  reachedOffer: number;
  /** Events whose outcome is "saved". */
  accepted: number;
  /** Events whose outcome is "cancelled". */
  cancelled: number;
  /** Events still "in_progress" whose startedAt is older than 1h (treated as abandoned). */
  abandoned: number;
}

export interface Retention90Split {
  retained: number;
  churned: number;
  /** Saved events not yet matured (retention90 absent OR savedAt within the last 90d). */
  pending: number;
}

export interface CancellationFlowSummary {
  triggered: number;
  byReason: Record<CancellationReason, ReasonBreakdown>;
  funnel: CancellationFunnel;
  /** accepted / (accepted + cancelled + abandoned); 0 when denominator is 0. */
  saveRate: number;
  /** saveRate expressed as a percentage 0–100. */
  saveRatePct: number;
  /** Count of saved events broken down by which offer was accepted. */
  byOfferAccepted: Record<OfferType, number>;
  /** Past-due events are excluded from offer-conversion denominators; surfaced for UI copy. */
  pastDueExcludedFromOfferConversion: number;
  retention90: Retention90Split;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pure aggregation shaper for cancellation-flow analytics. No I/O — given the
 * raw events and the current time, returns the fully-shaped summary.
 *
 * Funnel definitions:
 *  - reachedReason  = total events (a reason is mandatory to start a flow)
 *  - reachedOffer   = offersShown.length > 0 AND NOT pastDue
 *  - accepted       = outcome === "saved"
 *  - cancelled      = outcome === "cancelled"
 *  - abandoned      = outcome === "in_progress" AND startedAt <= now - 1h
 *
 * saveRate = accepted / (accepted + cancelled + abandoned); 0 if denom is 0.
 *
 * retention90 (over saved events only):
 *  - retained = retention90 === "retained"
 *  - churned  = retention90 === "churned"
 *  - pending  = saved but retention90 null/absent OR savedAt > now - 90d
 */
export function summarizeCancellationEvents(
  events: ICancellationFlowEvent[],
  now: Date
): CancellationFlowSummary {
  const triggered = events.length;
  const abandonedCutoff = now.getTime() - ONE_HOUR_MS;
  const retentionCutoff = now.getTime() - NINETY_DAYS_MS;

  const byReason = {} as Record<CancellationReason, ReasonBreakdown>;
  for (const reason of CANCELLATION_REASONS) {
    byReason[reason] = { count: 0, sharePct: 0 };
  }

  const byOfferAccepted = {} as Record<OfferType, number>;
  for (const offer of OFFER_TYPES) {
    byOfferAccepted[offer] = 0;
  }

  const funnel: CancellationFunnel = {
    reachedReason: triggered,
    reachedOffer: 0,
    accepted: 0,
    cancelled: 0,
    abandoned: 0,
  };

  const retention90: Retention90Split = { retained: 0, churned: 0, pending: 0 };
  let pastDueExcludedFromOfferConversion = 0;

  for (const ev of events) {
    if (byReason[ev.reason]) {
      byReason[ev.reason].count += 1;
    }

    if (ev.pastDue) {
      pastDueExcludedFromOfferConversion += 1;
    }

    if (Array.isArray(ev.offersShown) && ev.offersShown.length > 0 && !ev.pastDue) {
      funnel.reachedOffer += 1;
    }

    if (ev.outcome === "saved") {
      funnel.accepted += 1;

      if (ev.offerAccepted && byOfferAccepted[ev.offerAccepted] !== undefined) {
        byOfferAccepted[ev.offerAccepted] += 1;
      }

      // retention90 split over saved events only.
      const savedAtMs = ev.savedAt ? new Date(ev.savedAt).getTime() : null;
      const matured = savedAtMs !== null && savedAtMs <= retentionCutoff;
      if (ev.retention90 === "retained" && matured) {
        retention90.retained += 1;
      } else if (ev.retention90 === "churned" && matured) {
        retention90.churned += 1;
      } else {
        // null/absent retention90, or not yet matured (savedAt within last 90d).
        retention90.pending += 1;
      }
    } else if (ev.outcome === "cancelled") {
      funnel.cancelled += 1;
    } else if (ev.outcome === "in_progress") {
      const startedAtMs = ev.startedAt ? new Date(ev.startedAt).getTime() : null;
      if (startedAtMs !== null && startedAtMs <= abandonedCutoff) {
        funnel.abandoned += 1;
      }
    }
  }

  // Shares — guard divide-by-zero.
  if (triggered > 0) {
    for (const reason of CANCELLATION_REASONS) {
      byReason[reason].sharePct = roundPct((byReason[reason].count / triggered) * 100);
    }
  }

  const saveDenom = funnel.accepted + funnel.cancelled + funnel.abandoned;
  const saveRate = saveDenom > 0 ? funnel.accepted / saveDenom : 0;
  const saveRatePct = roundPct(saveRate * 100);

  return {
    triggered,
    byReason,
    funnel,
    saveRate,
    saveRatePct,
    byOfferAccepted,
    pastDueExcludedFromOfferConversion,
    retention90,
  };
}

export interface CancellationFlowAnalyticsParams {
  /** Inclusive lower bound on startedAt. */
  from?: Date;
  /** Exclusive upper bound on startedAt. */
  to?: Date;
}

/**
 * DB-touching entry point. Fetches cancellation-flow events within a window
 * whose lower bound is always present — an explicit `from` when supplied,
 * otherwise 90 days before the upper bound (`to`, or `now` when `to` is also
 * absent) — so we never unbounded-scan the collection. Delegates the
 * aggregation to the pure {@link summarizeCancellationEvents}.
 */
export async function getCancellationFlowAnalytics(
  params: CancellationFlowAnalyticsParams = {}
): Promise<CancellationFlowSummary> {
  await connectDB();

  const now = new Date();
  const startedAt: { $gte: Date; $lt?: Date } = {
    // The query is always lower-bounded so we never unbounded-scan the
    // collection: use an explicit `from` when supplied, otherwise default to
    // 90 days before the upper bound (or `now` if no `to` was given).
    $gte: params.from ?? new Date((params.to ?? now).getTime() - NINETY_DAYS_MS),
  };

  if (params.to) {
    startedAt.$lt = params.to;
  }

  const filter: FilterQuery<ICancellationFlowEvent> = { startedAt };

  const events = (await CancellationFlowEvent.find(filter)
    .lean()
    .exec()) as unknown as ICancellationFlowEvent[];

  return summarizeCancellationEvents(events, now);
}
