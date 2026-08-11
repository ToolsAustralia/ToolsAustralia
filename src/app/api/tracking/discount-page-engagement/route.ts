import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PartnerDiscountAnalyticsService from "@/services/partner-discount-analytics/PartnerDiscountAnalyticsService";
import { recordDiscountEngagement } from "@/utils/partner-discounts/record-discount-visit";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const COUNT = z.number().int().min(0).max(10_000);

const discountPageEngagementSchema = z.object({
  surface: z.enum(["discount", "catalogue"]),
  /**
   * The visitor's resolved partner-access %. Corrects the visit row, which is written the
   * instant the page mounts — before a member's tier has necessarily arrived — so that a
   * two-second bounce is still counted as a visit. Omitted leaves the row's value untouched.
   */
  accessPct: z.number().int().min(0).max(100).optional(),
  interacted: z.boolean(),
  offersOpened: COUNT,
  lockedOffersOpened: COUNT,
  seamRendered: z.boolean(),
  seamReached: z.boolean(),
  unlockClicks: COUNT,
  portalHandoff: z.boolean(),
  zeroResultSearch: z.boolean(),
});

/**
 * Unlike the sibling visit beacon this route UPDATES an existing row in place rather than
 * inserting, so abuse leaves zero row growth for a row-count sanity check to catch. Hence its
 * own bucket and its own budget.
 *
 * A real visitor sends this at most a handful of times per page-session — the client flushes
 * on `visibilitychange`, `pagehide` and unmount, and skips the flush entirely when nothing
 * changed since the last one. 60/5min matches the repo's public-endpoint precedent and leaves
 * large headroom.
 *
 * Budgeted per VISITOR, not per IP, for the same CGNAT reason as the visit beacon.
 */
const discountPageEngagementRateLimiter = createRateLimiter("discount-page-engagement", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 60,
});

/**
 * POST /api/tracking/discount-page-engagement
 *
 * Attaches what the visitor DID on a partner-discount surface to the visit row created on
 * mount: whether they filtered, how many offers they opened, whether they reached the access
 * seam, whether they clicked through to unlock, whether they crossed into the portal.
 *
 * A SECOND BEACON, not extra fields on the visit beacon: visits must be recorded on arrival
 * regardless of whether anyone interacts, so delaying that write to wait for engagement would
 * lose every bounced visitor — which is precisely the population "is the seam working" is
 * about.
 *
 * THE PAYLOAD IS CUMULATIVE, NOT DELTAS, and the repository writes it with `$set`. That is
 * what makes the three flush triggers safe: two or three flushes for one visit converge on
 * the same row state instead of triple-counting, with no client-side bookkeeping and no
 * corruption on a retried request.
 *
 * DB work runs in `after()` for the same reason as the visit beacon.
 *
 * @see docs/tracking/api.md
 * @see docs/partner/analytics.md
 */
export async function POST(request: NextRequest) {
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;
  const identifier =
    anonymousId ??
    getClientIdentifier(request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for"));
  const rateLimitResult = discountPageEngagementRateLimiter.check(identifier);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many requests",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
    );
  }

  let validatedData: z.infer<typeof discountPageEngagementSchema>;
  try {
    const body = await request.json();
    validatedData = discountPageEngagementSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // `anonymousId` is read synchronously at the top of the handler (it also keys the rate
  // limiter) — `request` must not be touched inside `after()`. No session read here: this
  // route only ever updates a row the visit beacon already stamped with identity.

  after(async () => {
    try {
      const outcome = await recordDiscountEngagement(
        { ...validatedData, anonymousId },
        {
          updateVisitEngagement: (payload) =>
            PartnerDiscountAnalyticsService.recordEngagement(payload),
        }
      );

      // "no_visit_row" and "no_anonymous_id" are EXPECTED outcomes, not errors: a visitor
      // whose mount beacon was rate-limited, whose row aged past the TTL, or who has no
      // anonymousId cookie has nothing to attach to. Logging them would be noise.
      if (
        !outcome.recorded &&
        outcome.reason !== "no_visit_row" &&
        outcome.reason !== "no_anonymous_id"
      ) {
        console.error("[discount-page-engagement] recordEngagement failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[discount-page-engagement] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Engagement tracked" });
}
