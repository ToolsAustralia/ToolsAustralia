import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { recordPrizeBuild } from "@/utils/promo-analytics/record-prize-build";

const promoPrizeBuildSchema = z.object({
  slug: z.string().min(1).max(100),
  builtPrizeSlug: z.string().min(1).max(100),
  toolboxSwitches: z.number().int().min(0).max(10_000),
  toolsetSwitches: z.number().int().min(0).max(10_000),
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
 * @see docs/tracking/api.md
 */
export async function POST(request: NextRequest) {
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

  // Read from `request` synchronously — it must not be touched inside `after()`.
  const anonymousId = AnonymousIdService.extractAnonymousId(request) ?? undefined;

  after(async () => {
    try {
      const outcome = await recordPrizeBuild(
        {
          slug: validatedData.slug,
          builtPrizeSlug: validatedData.builtPrizeSlug,
          toolboxSwitches: validatedData.toolboxSwitches,
          toolsetSwitches: validatedData.toolsetSwitches,
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
            });
            return result.success;
          },
        }
      );

      // "no_visit_row" is an expected outcome (dedup race, TTL, no landing beacon) — not an error.
      if (!outcome.recorded && outcome.reason !== "no_visit_row") {
        console.error("[promo-prize-build] recordPrizeBuild failed:", outcome.reason);
      }
    } catch (error) {
      console.error("[promo-prize-build] deferred tracking error:", error);
    }
  });

  return NextResponse.json({ success: true, message: "Build tracked" });
}
