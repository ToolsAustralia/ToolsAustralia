// src/services/attribution/normalizePlatform.ts
// Maps a (dirty) utm_source [+ utm_medium] to a canonical ConvertingPlatform.
// Dirty-UTM casing/aliasing is the #1 DIY-attribution failure mode — normalize here.
import type { ConvertingPlatform } from "@/types/attribution";

export const SOURCE_ALIASES: Record<string, ConvertingPlatform> = {
  // Meta — clean forms + the domain/referrer forms real ad traffic actually carries.
  // e.g. utm_source=facebook.com on paid CPC accounts for 7,300+ historical rows; without
  // these, Meta acquisition revenue is silently mis-bucketed to "other" and ROAS understated.
  facebook: "meta", fb: "meta", instagram: "meta", ig: "meta", meta: "meta", fbig: "meta",
  "facebook.com": "meta", "m.facebook.com": "meta", "l.facebook.com": "meta",
  "lm.facebook.com": "meta", "web.facebook.com": "meta", "business.facebook.com": "meta",
  "fb.com": "meta", "instagram.com": "meta", "m.instagram.com": "meta",
  "l.instagram.com": "meta", "ig.com": "meta",
  // Meta appends its site-source-name on some placements. VERIFIED in production: 4 visit rows
  // carry `facebook.com-WebsiteKeyInfo`, which without this line bucket to "other".
  "facebook.com-websitekeyinfo": "meta",
  // TikTok
  tiktok: "tiktok", tt: "tiktok", "tiktok.com": "tiktok", "www.tiktok.com": "tiktok", "vm.tiktok.com": "tiktok",
  // Snapchat
  snapchat: "snapchat", snap: "snapchat", "snapchat.com": "snapchat",
  // Google (paid). NOTE: organic "google.com" is intentionally NOT mapped — that would credit
  // organic search to the paid Google channel (reserved for gclid). Only paid forms map here.
  google: "google", adwords: "google", googleads: "google", "googleadservices.com": "google",
};

/**
 * Sources whose channel depends on `utm_medium`.
 *
 * Declarative twin of what used to be an inline `if (src === "klaviyo")` branch. A flat Record
 * cannot express a medium-dependent split, so the rule lived in code — which made it
 * un-enumerable, and an enumerable rule is exactly what an index-usable `$match` needs. With
 * the rule in a table, the JS normalizer, the Mongo `$switch`, and the drill-down predicate are
 * all GENERATED from one source of truth and cannot disagree.
 */
export const MEDIUM_SPLIT_SOURCES: Record<string, Record<string, ConvertingPlatform>> = {
  klaviyo: { email: "klaviyo_email", sms: "klaviyo_sms" }, // any other medium -> "other"
};

/** Returns null when no source is present; "other" when present but unrecognized. */
export function normalizeUtmToPlatform(
  utmSource?: string | null,
  utmMedium?: string | null
): ConvertingPlatform | null {
  const src = (utmSource ?? "").toLowerCase().trim();
  if (!src) return null;
  const split = MEDIUM_SPLIT_SOURCES[src];
  if (split) return split[(utmMedium ?? "").toLowerCase().trim()] ?? "other";
  return SOURCE_ALIASES[src] ?? "other";
}

/**
 * Exact lowercase `utm_source` values that resolve to `channel`.
 * Empty for `direct`/`other`, which are defined by absence and by complement respectively.
 */
export function channelSourceValues(channel: ConvertingPlatform): string[] {
  const out = Object.entries(SOURCE_ALIASES)
    .filter(([, c]) => c === channel)
    .map(([s]) => s);
  for (const [src, byMedium] of Object.entries(MEDIUM_SPLIT_SOURCES)) {
    if (Object.values(byMedium).includes(channel)) out.push(src);
  }
  return out;
}

/** Every source the tables know. Its complement is what defines "other". */
export const ALL_KNOWN_SOURCES: string[] = [
  ...Object.keys(SOURCE_ALIASES),
  ...Object.keys(MEDIUM_SPLIT_SOURCES),
];

/**
 * MongoDB twin of `normalizeUtmToPlatform`, GENERATED from the same two tables.
 *
 * Applied identically to `PromoAnalyticsVisit.utmSource`, `User.signupAttribution.utmSource`
 * and `PaymentEvent.data.utmSource` — that identity IS the fix. Those three were previously
 * matched three different ways (case-insensitive `$regex` for visits, exact equality against a
 * lowercased value for signups and conversions, `$toLower` grouping for the parent table), so
 * production's `Klaviyo` (6,437 visits / 868 signups) and `TIKTOK` (1,399 / 194) reported real
 * traffic with zero signups, zero conversions and $0 revenue.
 *
 * Deliberately NO fuzzy host-stripping fallback: a fuzzy rule is expressible in `$switch` but
 * NOT in an index-usable `$match`, so the drill-down predicate and the grouping key could
 * disagree — which is the exact bug shape this is fixing. One config line per dirty form instead.
 */
export function channelKeyExpr(sourcePath: string, mediumPath: string) {
  const byChannel = new Map<ConvertingPlatform, string[]>();
  for (const [src, ch] of Object.entries(SOURCE_ALIASES)) {
    byChannel.set(ch, [...(byChannel.get(ch) ?? []), src]);
  }
  return {
    $let: {
      vars: {
        s: { $trim: { input: { $toLower: { $ifNull: [sourcePath, ""] } } } },
        m: { $trim: { input: { $toLower: { $ifNull: [mediumPath, ""] } } } },
      },
      in: {
        $switch: {
          branches: [
            { case: { $eq: ["$$s", ""] }, then: "direct" },
            // Medium-split sources FIRST — they must not fall through to SOURCE_ALIASES.
            ...Object.entries(MEDIUM_SPLIT_SOURCES).map(([src, byMedium]) => ({
              case: { $eq: ["$$s", src] },
              then: {
                $switch: {
                  branches: Object.entries(byMedium).map(([med, ch]) => ({
                    case: { $eq: ["$$m", med] },
                    then: ch,
                  })),
                  default: "other",
                },
              },
            })),
            ...[...byChannel].map(([ch, sources]) => ({
              case: { $in: ["$$s", sources] },
              then: ch,
            })),
          ],
          default: "other",
        },
      },
    },
  };
}

/**
 * `$match` fragment selecting exactly the documents whose channel is `channel`.
 *
 * Deliberately implemented as `$expr` over the SAME `channelKeyExpr` used to build the grouping
 * key, rather than as a hand-written `{ utmSource: { $in: [...] } }` predicate. Two reasons, and
 * the second is not negotiable:
 *
 * 1. CORRECTNESS. Stored values are raw-cased — production holds `Klaviyo` (6,437 visits),
 *    `TIKTOK` (1,399) and `facebook.com-WebsiteKeyInfo`. An `$in` against the lowercase alias
 *    keys matches NONE of them, which is the precise shape of the bug this replaces (visits
 *    matched case-insensitively, signups and conversions matched case-sensitively, so Klaviyo
 *    showed 6,437 visits with 0 signups and $0 revenue).
 * 2. NON-DIVERGENCE. A drill-down predicate that is merely *equivalent* to the grouping key can
 *    drift from it. This one IS the grouping key, so a parent row and its drill-down cannot
 *    disagree — by construction, not by test.
 *
 * TRADE-OFF, accepted: `$expr` is not index-usable, so this cannot be served by an index on
 * `utmSource` alone. Every caller pairs it with a date-range `$match` first, which IS
 * index-served, and the visit collection is bounded by a 90-day TTL — so the expression only
 * ever evaluates over one window's worth of rows. This is not a regression: the code it replaces
 * used `new RegExp("^" + src + "$", "i")`, which no index can serve either.
 */
export function channelMatch(sourcePath: string, mediumPath: string, channel: ConvertingPlatform) {
  return { $expr: { $eq: [channelKeyExpr(sourcePath, mediumPath), channel] } };
}
