/**
 * Functional core for partner-discount page analytics: dedup -> resolve attribution -> persist,
 * and later, clamp -> attach engagement.
 *
 * Side effects (the dedup read, the insert, the update) are INJECTED, so both orchestrations
 * are unit-testable with no DB and no network. The two beacon routes are the imperative
 * shells: each captures request values synchronously, then calls in here inside Next's
 * `after()` so the work runs off the response path.
 *
 * BOTH CORES LIVE IN ONE FILE ON PURPOSE. The promo domain splits its equivalents across
 * `record-promo-visit.ts` and `record-prize-build.ts`, but these two share the surface type,
 * the clamp and the "no anonymousId means no row" rule, and together come to less code than
 * either promo file alone. Splitting them would duplicate all three.
 *
 * @see src/app/api/tracking/discount-page-visit/route.ts
 * @see src/app/api/tracking/discount-page-engagement/route.ts
 * @see docs/partner/analytics.md
 */
import { parseReferrer } from "@/utils/tracking/referrer-helpers";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import type { PartnerDiscountSurface } from "@/models/PartnerDiscountVisit";

/**
 * Upper bound on a plausible per-visit counter. Anything above is a bug or abuse, and is
 * clamped rather than rejected — dropping the whole flush over one silly number would lose
 * the honest columns alongside it.
 */
const MAX_COUNT = 1000;

// ─── Visit ────────────────────────────────────────────────────────────────

/** Request-derived values captured synchronously by the route before the response is sent. */
export interface DiscountVisitCapture {
  surface: PartnerDiscountSurface;
  anonymousId?: string;
  userId?: string;
  signedIn: boolean;
  /** Absent when the visitor's tier had not resolved yet — NOT the same as zero. */
  accessPct?: number;
  /** Raw `referer` request header. */
  referrerHeader: string;
  /** URL used for attribution parsing (x-forwarded-url / referer / request.url). */
  url: string;
  /**
   * First-touch UTM from the durable `_ta_attr` cookie, read SERVER-side by the route.
   *
   * Takes precedence over the landing URL so visits, signups and conversions are all
   * attributed on the same basis — the promo funnel learned this the hard way: reading the
   * landing URL here while signups read the cookie gave paid channels signups with no
   * visits, and Direct visits with no signups. Read on the server because the hook that
   * WRITES this cookie mounts above the one that fires the beacon, and React runs child
   * effects first, so a client-side read can beat the write on a first landing.
   */
  firstTouchUtmSource?: string;
  firstTouchUtmMedium?: string;
  firstTouchUtmCampaign?: string;
}

export interface DiscountVisitRecordPayload {
  surface: PartnerDiscountSurface;
  anonymousId?: string;
  userId?: string;
  signedIn: boolean;
  accessPct?: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmBasis?: "first_touch" | "landing_url";
}

export interface DiscountVisitDeps {
  /** True when a visit for this anonymousId + surface already exists within the dedup window. */
  hasRecentVisit: (args: {
    anonymousId: string;
    surface: PartnerDiscountSurface;
  }) => Promise<boolean>;
  /** Persists the visit row. */
  createVisit: (payload: DiscountVisitRecordPayload) => Promise<void>;
}

export type DiscountVisitOutcome =
  | { recorded: true }
  | { recorded: false; reason: "duplicate" | string };

/**
 * 0–100, integer — or `undefined` when the caller genuinely does not know.
 *
 * Absent is preserved rather than collapsed to 0, because "the tier had not resolved yet"
 * and "this visitor has no access" are different facts and only one of them is a member.
 * A malformed value is treated as no access rather than full access.
 */
export function clampAccessPct(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 100);
}

const clampCount = (n: number): number => {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_COUNT);
};

/**
 * Dedup (when an anonymousId is present), resolve UTM/referrer attribution, then persist.
 *
 * UTM resolution order: first-touch cookie, then the request body's explicit value, then the
 * URL, then a `fb_<campaign_id>` fallback for Facebook ads that omit utm_campaign.
 */
export async function recordDiscountVisit(
  capture: DiscountVisitCapture,
  deps: DiscountVisitDeps
): Promise<DiscountVisitOutcome> {
  if (capture.anonymousId) {
    // Dedup is best-effort: fail OPEN on a dedup error (timeout, connection failure) and
    // record anyway. The worst cost is one duplicate row inside the window; dropping the
    // visit would defeat the point of this path.
    let duplicate = false;
    try {
      duplicate = await deps.hasRecentVisit({
        anonymousId: capture.anonymousId,
        surface: capture.surface,
      });
    } catch (error) {
      console.error("[record-discount-visit] dedup read failed; recording anyway:", error);
    }
    if (duplicate) return { recorded: false, reason: "duplicate" };
  }

  const referrerInfo = parseReferrer(capture.referrerHeader);
  const attribution = extractAttributionParams(capture.url);

  const utmSource = capture.firstTouchUtmSource ?? attribution.utm_source;
  const utmMedium = capture.firstTouchUtmMedium ?? attribution.utm_medium;
  const utmCampaign =
    capture.firstTouchUtmCampaign ??
    attribution.utm_campaign ??
    (attribution.campaign_id ? `fb_${attribution.campaign_id}` : undefined);

  try {
    await deps.createVisit({
      surface: capture.surface,
      anonymousId: capture.anonymousId,
      userId: capture.userId,
      signedIn: capture.signedIn,
      accessPct: clampAccessPct(capture.accessPct),
      referrer: referrerInfo.referrer || undefined,
      utmSource,
      utmMedium,
      utmCampaign,
      // Makes an attribution shift falsifiable in production:
      //   db.partnerdiscountvisits.aggregate([{ $sortByCount: "$utmBasis" }])
      utmBasis: capture.firstTouchUtmSource ? "first_touch" : "landing_url",
    });
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : "record_failed" };
  }
  return { recorded: true };
}

// ─── Engagement ───────────────────────────────────────────────────────────

export interface DiscountEngagementCapture {
  surface: PartnerDiscountSurface;
  anonymousId?: string;
  /**
   * The visitor's tier, resolved by the time they left. Corrects the visit row, which may
   * have been written before the tier arrived. Absent leaves whatever the row already has.
   */
  accessPct?: number;
  interacted: boolean;
  offersOpened: number;
  lockedOffersOpened: number;
  seamRendered: boolean;
  seamReached: boolean;
  unlockClicks: number;
  portalHandoff: boolean;
  zeroResultSearch: boolean;
}

export interface DiscountEngagementDeps {
  /**
   * Attaches cumulative engagement to the visitor's most recent row for this surface.
   * Returns false when there is no row to attach to. MUST NOT create one.
   */
  updateVisitEngagement: (payload: {
    anonymousId: string;
    surface: PartnerDiscountSurface;
    accessPct?: number;
    interacted: boolean;
    offersOpened: number;
    lockedOffersOpened: number;
    seamRendered: boolean;
    seamReached: boolean;
    unlockClicks: number;
    portalHandoff: boolean;
    zeroResultSearch: boolean;
  }) => Promise<boolean>;
}

export type DiscountEngagementOutcome =
  | { recorded: true }
  | { recorded: false; reason: string };

/**
 * Clamp the client's cumulative counters and attach them to the existing visit row.
 *
 * The values are ABSOLUTE totals for the page-session, not deltas, and the write is a `$set`
 * — so the three flush triggers (visibilitychange, pagehide, unmount) firing two or three
 * times for one visit is harmless by construction rather than by bookkeeping.
 */
export async function recordDiscountEngagement(
  capture: DiscountEngagementCapture,
  deps: DiscountEngagementDeps
): Promise<DiscountEngagementOutcome> {
  // No anonymousId means there is no visit row to attach to. NEVER create one here: the
  // visit count is the number this feature must leave untouched.
  if (!capture.anonymousId) return { recorded: false, reason: "no_anonymous_id" };

  const offersOpened = clampCount(capture.offersOpened);
  // Locked opens are a SUBSET of offer opens by definition, so a payload claiming otherwise
  // is malformed. Clamping keeps the invariant true in the data, which means the read side
  // can present "of which locked" without ever rendering a share above 100%.
  const lockedOffersOpened = Math.min(clampCount(capture.lockedOffersOpened), offersOpened);
  // A seam cannot be reached on a visit where none was rendered — same reasoning.
  const seamRendered = capture.seamRendered;
  const seamReached = seamRendered && capture.seamReached;

  try {
    const updated = await deps.updateVisitEngagement({
      anonymousId: capture.anonymousId,
      surface: capture.surface,
      accessPct: clampAccessPct(capture.accessPct),
      interacted: capture.interacted,
      offersOpened,
      lockedOffersOpened,
      seamRendered,
      seamReached,
      unlockClicks: clampCount(capture.unlockClicks),
      portalHandoff: capture.portalHandoff,
      zeroResultSearch: capture.zeroResultSearch,
    });
    return updated ? { recorded: true } : { recorded: false, reason: "no_visit_row" };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : "update_failed" };
  }
}
