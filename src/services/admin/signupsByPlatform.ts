import User from "@/models/User";
import { normalizeUtmToPlatform } from "@/services/attribution/normalizePlatform";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

/**
 * Signup counts per acquisition platform for a date range — the per-platform companion
 * to the Advertising card's revenue/conversions, so an admin can see **how many accounts
 * a channel created**, not just how much revenue it converted.
 *
 * ## Attribution basis (deliberately the same one purchases use)
 *
 * Two sources, in priority order, both read off `User.signupAttribution`:
 *
 * 1. **`clickPlatform`** — a paid click id (`_fbc`/`ttclid`/`_sc_click`) was present in
 *    the request cookies at registration. Confidence: **click-verified**, the same basis
 *    `resolveConvertingPlatform` uses for payments.
 * 2. **`utmSource`** — normalized via `normalizeUtmToPlatform` (which already folds the
 *    dirty real-world forms: `facebook.com`, `vm.tiktok.com`, …). Confidence: **utm_only**.
 *
 * A signup with neither is **`direct`** — genuinely unattributed, NOT silently dropped,
 * so the platform counts and the total always reconcile.
 *
 * Counting `clickPlatform` first matters: a paid ad whose landing URL carries no UTM tags
 * would otherwise be indistinguishable from organic, under-counting the channel that paid
 * for it. Accounts created before 2026-07-24 have no `clickPlatform` and fall back to UTM.
 */
export interface SignupsByPlatformResult {
  /** Platform key → signup count. Keys with 0 signups are omitted. */
  byPlatform: Partial<Record<AttributedPlatformKey, number>>;
  /** Every signup in range, including `direct` — the sum of `byPlatform`. */
  total: number;
  /** Split of `total` by how the platform was determined (0 for the direct bucket). */
  byConfidence: { click: number; utm_only: number; none: number };
}

interface SignupAttributionProjection {
  signupAttribution?: {
    clickPlatform?: string;
    utmSource?: string;
    utmMedium?: string;
  };
}

/**
 * Count signups per platform for users created in [startDate, endDate].
 *
 * Read-only. Projects only the two attribution fields it needs (repo footgun rule #3 —
 * `User` carries large arrays like `entries[]` that must never be pulled for a count).
 */
export async function getSignupsByPlatform(
  startDate: Date,
  endDate: Date,
): Promise<SignupsByPlatformResult> {
  const users = await User.find({
    createdAt: { $gte: startDate, $lte: endDate },
    isActive: true,
  })
    .select("signupAttribution.clickPlatform signupAttribution.utmSource signupAttribution.utmMedium")
    .lean<SignupAttributionProjection[]>();

  const byPlatform: Partial<Record<AttributedPlatformKey, number>> = {};
  const byConfidence = { click: 0, utm_only: 0, none: 0 };

  for (const u of users) {
    const attr = u.signupAttribution;
    let platform: AttributedPlatformKey;

    if (attr?.clickPlatform) {
      platform = attr.clickPlatform as AttributedPlatformKey;
      byConfidence.click++;
    } else {
      const fromUtm = normalizeUtmToPlatform(attr?.utmSource, attr?.utmMedium);
      if (fromUtm) {
        platform = fromUtm as AttributedPlatformKey;
        byConfidence.utm_only++;
      } else {
        platform = "direct";
        byConfidence.none++;
      }
    }

    byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
  }

  return { byPlatform, total: users.length, byConfidence };
}
