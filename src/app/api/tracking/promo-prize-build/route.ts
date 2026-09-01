import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { recordPrizeBuild } from "@/utils/promo-analytics/record-prize-build";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const promoPrizeBuildSchema = z.object({
  slug: z.string().min(1).max(100),
  builtPrizeSlug: z.string().min(1).max(100),
  toolboxSwitches: z.number().int().min(0).max(10_000),
  toolsetSwitches: z.number().int().min(0).max(10_000),
  // Optional so an in-flight older client (or a queued `sendBeacon` from before a deploy) is
  // still accepted; absent is treated as "engaged", matching how pre-flag rows are counted.
  interacted: z.boolean().optional(),
});

// Unauthenticated + keyed only on a format-checked cookie, and unlike the sibling visit beacon
// this route UPDATES an existing row in place rather than inserting — so abuse leaves zero row
// growth for a row-count sanity check to catch. A real visitor's beacon is debounced ~1s and
// flushed once on unload, so even heavy reel-fiddling produces a handful of requests per page
// view. See docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md F-001.
//
// Budgeted per VISITOR, not per IP (F-024). Australian carriers put very large numbers of
// users behind one CGNAT egress IP, so an IP-keyed budget lets one ad burst exhaust the quota
// for everyone behind it — and because the beacon is fire-and-forget, the dropped writes are
// silent. 60/5min matches the repo's own public-endpoint precedent (`promo/link/validate`,
// 60/min); the earlier 20 was 15× tighter than anything else public here.
const promoPrizeBuildRateLimiter = createRateLimiter("promo-prize-build", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 60,
});

/**
 * POST /api/tracking/promo-prize-build
 *
 * Attaches the prize a visitor assembled in "Build your prize" — plus how much they engaged
 * with the reels — to the visit row created on landing. No auth; keyed by the anonymousId
 * cookie.
 *
 * This is deliberately a SECOND beacon rather than extra fields on
 * `/api/tracking/promo-page-visit`: visits must be recorded on landing regardless of whether
 * anyone interacts, so delaying that beacon to wait for a build would lose every bounced
 * visitor.
 *
 * DB work runs in `after()` for the same reason as the visit beacon — this fires from the
 * highest-traffic ad-landing path, and a stalled Mongo connection must never 504 it. See the
 * long note in `promo-page-visit/route.ts`.
 *
 * Rate limited (20 req / 5 min per identifier, checked synchronously before the Zod parse and
 * before `after()` is scheduled) — this route UPDATES an existing visit row via `$set`, so
 * unlike the sibling visit beacon (insert-only), abuse here leaves zero row growth for a
 * row-count check to catch.
 *
 * @see docs/tracking/api.md
 */
export async function POST(request: NextRequest) {
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;
  // Prefer the visitor cookie over the IP so shared/CGNAT egress IPs do not share one budget.
  // `ta_anon_id` is minted in middleware for every page request, so it is present on
  // essentially every genuine beacon; the IP is only the fallback for a request without it.
  // Note the argument order: `getClientIdentifier(ip, forwardedFor)` returns arg 1 verbatim when
  // truthy, so `x-real-ip` must come first — passing `x-forwarded-for` in both positions keys
  // the bucket on the whole proxy chain instead of the client (matches the four auth routes).
  const identifier =
    anonymousId ??
    getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
  const rateLimitResult = promoPrizeBuildRateLimiter.check(identifier);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: "Too many requests", retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
    );
  }

  let validatedData: z.infer<typeof promoPrizeBuildSchema>;
  try {
    const body = await request.json();
    validatedData = promoPrizeBuildSchema.parse(body);
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
  // limiter) — `request` must not be touched inside `after()`.

  after(async () => {
    try {
      const outcome = await recordPrizeBuild(
        {
          slug: validatedData.slug,
          builtPrizeSlug: validatedData.builtPrizeSlug,
          toolboxSwitches: validatedData.toolboxSwitches,
          toolsetSwitches: validatedData.toolsetSwitches,
          interacted: validatedData.interacted !== false,
          anonymousId,
        },
        {
          updateVisitBuild: async (payload) => {
            const result = await PromoAnalyticsService.recordPrizeBuild({
              anonymousId: payload.anonymousId,
              slug: payload.slug,
              builtPrizeSlug: payload.builtPrizeSlug,
              toolboxSwitches: payload.toolboxSwitches,
              toolsetSwitches: payload.toolsetSwitches,
              // Must be forwarded. Omitting it made the repository's `interacted !== false`
              // default fire for every write, so `buildInteracted` was true on 100% of rows and
              // the read gate `{ $ne: false }` matched everyone — "Builds" counted every visitor
              // who loaded the builder, not the ones who engaged. It cannot be reconstructed
              // from the switch counters: the cash toggle leaves both at 0 (F-010), and a
              // URL-param arrival re-hydrates a previously-switched build at 0/0 as well.
              interacted: payload.interacted,
            });
            return result.success;
          },
        }
      );

      // "no_visit_row" (dedup race, TTL, no landing beacon) and "no_anonymous_id" (a visitor
      // with no `ta_anon_id` cookie — blocked cookies, a privacy browser, a bot) are EXPECTED
      // outcomes, not errors: there is no row to attach the build to and nothing a fix could
      // recover. Matches the identical guard in the sibling beacon
      // (`discount-page-engagement/route.ts`), which excluded both from the start; omitting
      // "no_anonymous_id" here put ~210 non-events a month into Vercel's error stream.
      if (
        !outcome.recorded &&
        outcome.reason !== "no_visit_row" &&
        outcome.reason !== "no_anonymous_id"
      ) {
        console.error("[promo-prize-build] recordPrizeBuild failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[promo-prize-build] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Build tracked" });
}
