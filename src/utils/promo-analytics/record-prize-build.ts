/**
 * Functional core for attaching a built prize to a promo visit: validate -> clamp -> persist.
 *
 * Side effects are INJECTED so this is unit-testable with no DB. The route is the imperative
 * shell and calls this inside Next's `after()`, mirroring `record-promo-visit.ts`.
 *
 * @see src/app/api/tracking/promo-prize-build/route.ts
 * @see docs/promo/backend.md
 */
import { getPageTypeFromSlug, isValidPromoSlug } from "@/utils/promo-analytics/validate-promo-slug";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

/** Upper bound on a plausible per-page switch count; anything above is a bug or abuse. */
const MAX_SWITCHES = 1000;

export interface PrizeBuildCapture {
  /**
   * The LANDING page slug (pathname), never the built prize. `pageType` is deliberately NOT a
   * field here — it is derived from this slug, so the two can never disagree.
   */
  slug: string;
  /** The prize the visitor assembled. */
  builtPrizeSlug: string;
  toolboxSwitches: number;
  toolsetSwitches: number;
  /**
   * Did the visitor touch the builder at all on this page? NOT derivable from the counters —
   * cash is a toggle, not a reel card, so a cash-only visitor sits at 0/0 and still engaged.
   * Absent means engaged, matching the route's optional field and how pre-flag rows count.
   */
  interacted?: boolean;
  anonymousId?: string;
}

export interface PrizeBuildDeps {
  updateVisitBuild: (payload: {
    anonymousId: string;
    slug: string;
    pageType: PromoPageType;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
    interacted?: boolean;
  }) => Promise<boolean>;
}

export type PrizeBuildOutcome = { recorded: true } | { recorded: false; reason: string };

const clamp = (n: number): number => {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_SWITCHES);
};

export async function recordPrizeBuild(
  capture: PrizeBuildCapture,
  deps: PrizeBuildDeps
): Promise<PrizeBuildOutcome> {
  // No anonymousId means there is no visit row to attach to. Never create one here: the visit
  // count is the number this feature must leave untouched.
  if (!capture.anonymousId) return { recorded: false, reason: "no_anonymous_id" };

  const slug = capture.slug.toLowerCase().trim();
  const builtPrizeSlug = capture.builtPrizeSlug.toLowerCase().trim();
  if (!isValidPromoSlug(slug)) return { recorded: false, reason: "invalid_slug" };
  if (!isValidPromoSlug(builtPrizeSlug)) return { recorded: false, reason: "invalid_built_slug" };

  try {
    const updated = await deps.updateVisitBuild({
      anonymousId: capture.anonymousId,
      slug,
      pageType: getPageTypeFromSlug(slug),
      builtPrizeSlug,
      toolboxSwitches: clamp(capture.toolboxSwitches),
      toolsetSwitches: clamp(capture.toolsetSwitches),
      interacted: capture.interacted !== false,
    });
    return updated ? { recorded: true } : { recorded: false, reason: "no_visit_row" };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : "update_failed" };
  }
}
