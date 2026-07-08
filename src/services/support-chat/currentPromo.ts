/**
 * currentPromo.ts
 *
 * Resolves a short, PUBLIC, current-cycle promotion blurb for Cobber's system
 * prompt. This is the ONE place the support chatbot learns about live promotions,
 * and it does so by reusing the SAME resolver the public promo banners use —
 * PromoMultiplierResolverService.getEffectiveForBanner() — so the bot and the
 * banners can never disagree, and unannounced FUTURE scheduled promos are never
 * surfaced (getEffectiveForBanner only returns promos active right now).
 *
 * Safety contract:
 *   - NEVER throws and NEVER blocks a chat: any error → returns null ("no promo").
 *   - PII-free / aggregate-free: an entry multiplier is public marketing data
 *     (the same number on the banner everyone sees), not member or business data.
 *   - Returns null when there is no active multiplier (multiplier null or ≤ 1).
 *
 * Layering: services layer (it composes another service). The chatbot consumes it
 * via dependency injection so tests stay Mongo-free.
 */

import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";
import type { PackageType } from "@/services/admin/PromoMultiplierResolverService";
import type { EffectiveForBannerEntry } from "@/types/admin";

/** Injectable seam for tests (no Mongo). Defaults to the real banner resolver. */
export interface CurrentPromoDeps {
  getEffectiveForBanner?: () => Promise<Record<PackageType, EffectiveForBannerEntry>>;
}

/** Customer-facing label for each package type. */
const PACKAGE_LABEL: Record<string, string> = {
  "membership-packages": "membership purchases",
  "one-time-packages": "one-time tool packs",
  "mini-packages": "Mini Draw packs",
};

/**
 * Returns a one-line current-promo blurb, or null when nothing is running.
 *
 * Example outputs:
 *   "Right now there's a 10X entry-multiplier promotion on qualifying purchases — …"
 *   "Right now: 10X on membership purchases; 5X on one-time tool packs — …"
 */
export async function getCurrentPromoBlurb(
  deps: CurrentPromoDeps = {}
): Promise<string | null> {
  try {
    const resolve =
      deps.getEffectiveForBanner ??
      (() => new PromoMultiplierResolverService().getEffectiveForBanner());
    const banner = await resolve();

    const active = Object.entries(banner).filter(
      ([, e]) => typeof e?.multiplier === "number" && (e.multiplier as number) > 1
    ) as Array<[string, EffectiveForBannerEntry & { multiplier: number }]>;

    if (active.length === 0) return null;

    const distinct = new Set(active.map(([, e]) => e.multiplier));
    if (distinct.size === 1) {
      const m = active[0][1].multiplier;
      return `Right now there's a ${m}X entry-multiplier promotion running on qualifying purchases — it multiplies the entries on a purchase automatically (the price doesn't change).`;
    }

    const parts = active.map(
      ([type, e]) => `${e.multiplier}X on ${PACKAGE_LABEL[type] ?? type}`
    );
    return `Right now there are entry-multiplier promotions running: ${parts.join(
      "; "
    )} — they multiply the entries on a qualifying purchase automatically (the price doesn't change).`;
  } catch (err) {
    // Fail-safe: a promo lookup must never break or delay a support answer.
    console.error("[currentPromo] failed to resolve current promo", err);
    return null;
  }
}
