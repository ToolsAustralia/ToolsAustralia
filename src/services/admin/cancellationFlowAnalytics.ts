import type { FilterQuery } from "mongoose";
import connectDB from "@/lib/mongodb";
import CancellationFlowEvent, {
  CANCELLATION_REASONS,
  OFFER_TYPES,
  type CancellationReason,
  type OfferType,
  type ICancellationFlowEvent,
} from "@/models/CancellationFlowEvent";
import User from "@/models/User";

const ONE_HOUR_MS = 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Per-reason breakdown row. */
export interface ReasonBreakdown {
  count: number;
  /** Share of total triggered events, 0–100. 0 when there are no events. */
  sharePct: number;
  /** Saved (outcome === "saved") events with this reason. */
  accepted: number;
  /** Cancelled (outcome === "cancelled") events with this reason. */
  cancelled: number;
  /** In-progress events with this reason whose startedAt is older than 1h. */
  abandoned: number;
}

/** Free-text entry from a user who selected reason="other". */
export interface OtherReasonEntry {
  text: string;
  /** ISO string (Date is serialized over the wire by NextResponse.json). */
  startedAt: string;
  outcome: "in_progress" | "saved" | "cancelled";
  /** User who submitted the free-text reason. May be absent for legacy events. */
  userId?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
}

/**
 * One user-level row for the "Reason × outcome" drill-down modal. Each row
 * corresponds to a single CancellationFlowEvent (a user may appear more than
 * once if they entered the flow multiple times in the window).
 */
export interface ReasonUserRow {
  eventId: string;
  userId?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  /** ISO string. */
  startedAt: string;
  outcome: "in_progress" | "saved" | "cancelled";
  /** Only set when reason === "other". Trimmed; absent if blank. */
  reasonText?: string;
  /** When the user accepted an offer (saved outcome). */
  offerAccepted?: OfferType | null;
}

export interface ReasonUsersResult {
  rows: ReasonUserRow[];
  /** Total before paging — surfaced for the modal subtitle. */
  totalCount: number;
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
  /**
   * 90-day retention split per accepted offer. Same matured/pending logic as
   * the overall {@link Retention90Split}, but keyed by the saved event's
   * `offerAccepted`. Only saved events with a non-null `offerAccepted`
   * contribute. Every `OfferType` key is always present (zeroed when unused).
   */
  retention90ByOffer: Record<OfferType, Retention90Split>;
  /**
   * Free-text entries from events whose reason was "other". Sorted by
   * startedAt descending. Empty `reasonText` values are excluded.
   */
  otherReasonTexts: OtherReasonEntry[];
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
 *
 * retention90ByOffer applies the SAME matured/pending cutoff, keyed by the
 * saved event's `offerAccepted` (saved events with no `offerAccepted` are
 * excluded from the per-offer split but still counted in the overall one).
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
    byReason[reason] = { count: 0, sharePct: 0, accepted: 0, cancelled: 0, abandoned: 0 };
  }

  const otherReasonTexts: OtherReasonEntry[] = [];

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
  const retention90ByOffer = {} as Record<OfferType, Retention90Split>;
  for (const offer of OFFER_TYPES) {
    retention90ByOffer[offer] = { retained: 0, churned: 0, pending: 0 };
  }
  let pastDueExcludedFromOfferConversion = 0;

  for (const ev of events) {
    if (byReason[ev.reason]) {
      byReason[ev.reason].count += 1;
    }

    if (ev.reason === "other" && typeof ev.reasonText === "string" && ev.reasonText.trim().length > 0) {
      otherReasonTexts.push({
        text: ev.reasonText.trim(),
        startedAt: (ev.startedAt instanceof Date
          ? ev.startedAt
          : new Date(ev.startedAt as unknown as string)
        ).toISOString(),
        outcome: ev.outcome,
        userId: ev.userId ? String(ev.userId) : undefined,
      });
    }

    if (ev.pastDue) {
      pastDueExcludedFromOfferConversion += 1;
    }

    if (Array.isArray(ev.offersShown) && ev.offersShown.length > 0 && !ev.pastDue) {
      funnel.reachedOffer += 1;
    }

    if (ev.outcome === "saved") {
      funnel.accepted += 1;
      if (byReason[ev.reason]) byReason[ev.reason].accepted += 1;

      if (ev.offerAccepted && byOfferAccepted[ev.offerAccepted] !== undefined) {
        byOfferAccepted[ev.offerAccepted] += 1;
      }

      // retention90 split over saved events only. The same `matured` boundary
      // is reused for the per-offer split below — no skew vs the overall split
      // or the §6a maturity cron (all use savedAt <= now - 90d).
      const savedAtMs = ev.savedAt ? new Date(ev.savedAt).getTime() : null;
      const matured = savedAtMs !== null && savedAtMs <= retentionCutoff;
      // Per-offer bucket (only when this saved event accepted a known offer).
      const offerSplit =
        ev.offerAccepted && retention90ByOffer[ev.offerAccepted] !== undefined
          ? retention90ByOffer[ev.offerAccepted]
          : null;
      if (ev.retention90 === "retained" && matured) {
        retention90.retained += 1;
        if (offerSplit) offerSplit.retained += 1;
      } else if (ev.retention90 === "churned" && matured) {
        retention90.churned += 1;
        if (offerSplit) offerSplit.churned += 1;
      } else {
        // null/absent retention90, or not yet matured (savedAt within last 90d).
        retention90.pending += 1;
        if (offerSplit) offerSplit.pending += 1;
      }
    } else if (ev.outcome === "cancelled") {
      funnel.cancelled += 1;
      if (byReason[ev.reason]) byReason[ev.reason].cancelled += 1;
    } else if (ev.outcome === "in_progress") {
      const startedAtMs = ev.startedAt ? new Date(ev.startedAt).getTime() : null;
      if (startedAtMs !== null && startedAtMs <= abandonedCutoff) {
        funnel.abandoned += 1;
        if (byReason[ev.reason]) byReason[ev.reason].abandoned += 1;
      }
    }
  }

  // Sort "other" free-text entries newest first.
  otherReasonTexts.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

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
    retention90ByOffer,
    otherReasonTexts,
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

  const summary = summarizeCancellationEvents(events, now);

  // Hydrate user details for the "Other" free-text entries so admins can
  // open the User Detail modal directly from the table.
  const userIds = Array.from(
    new Set(summary.otherReasonTexts.map((e) => e.userId).filter((v): v is string => !!v))
  );
  if (userIds.length > 0) {
    const users = await User.find({ _id: { $in: userIds } })
      .select({ email: 1, firstName: 1, lastName: 1 })
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    summary.otherReasonTexts = summary.otherReasonTexts.map((entry) => {
      if (!entry.userId) return entry;
      const u = userMap.get(entry.userId);
      if (!u) return entry;
      return {
        ...entry,
        userEmail: u.email ?? undefined,
        userFirstName: u.firstName ?? undefined,
        userLastName: u.lastName ?? undefined,
      };
    });
  }

  return summary;
}

export interface CancellationFlowUsersByReasonParams {
  reason: CancellationReason;
  /** When provided, restrict to events with this outcome. */
  outcome?: "in_progress" | "saved" | "cancelled";
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * Returns paginated user-level rows for a single reason, optionally filtered
 * by outcome. Powers the "Reason × outcome" drill-down modal.
 */
export async function getCancellationFlowUsersByReason(
  params: CancellationFlowUsersByReasonParams
): Promise<ReasonUsersResult> {
  await connectDB();

  const now = new Date();
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));

  const filter: FilterQuery<ICancellationFlowEvent> = {
    reason: params.reason,
    startedAt: {
      $gte: params.from ?? new Date((params.to ?? now).getTime() - NINETY_DAYS_MS),
    },
  };
  if (params.to) {
    (filter.startedAt as { $lt?: Date }).$lt = params.to;
  }
  if (params.outcome) {
    filter.outcome = params.outcome;
  }

  const [totalCount, events] = await Promise.all([
    CancellationFlowEvent.countDocuments(filter),
    CancellationFlowEvent.find(filter)
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec() as unknown as Promise<ICancellationFlowEvent[]>,
  ]);

  const userIds = Array.from(
    new Set(events.map((e) => (e.userId ? String(e.userId) : null)).filter((v): v is string => !!v))
  );

  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds } })
          .select({ email: 1, firstName: 1, lastName: 1 })
          .lean()
      : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const rows: ReasonUserRow[] = events.map((ev) => {
    const userIdStr = ev.userId ? String(ev.userId) : undefined;
    const u = userIdStr ? userMap.get(userIdStr) : undefined;
    return {
      eventId: String((ev as ICancellationFlowEvent & { _id: unknown })._id),
      userId: userIdStr,
      userEmail: u?.email ?? undefined,
      userFirstName: u?.firstName ?? undefined,
      userLastName: u?.lastName ?? undefined,
      startedAt: (ev.startedAt instanceof Date
        ? ev.startedAt
        : new Date(ev.startedAt as unknown as string)
      ).toISOString(),
      outcome: ev.outcome,
      reasonText:
        ev.reason === "other" && typeof ev.reasonText === "string" && ev.reasonText.trim().length > 0
          ? ev.reasonText.trim()
          : undefined,
      offerAccepted: ev.offerAccepted ?? null,
    };
  });

  return { rows, totalCount };
}
