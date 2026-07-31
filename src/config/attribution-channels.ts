/**
 * Display metadata for the canonical acquisition channels (`ConvertingPlatform`).
 *
 * WHY THIS FILE EXISTS: channel labels used to be derived inside the data-access layer, three
 * separate times, as `src.charAt(0).toUpperCase() + src.slice(1)`
 * (PromoAnalyticsRepository — the per-channel table, the page drill-down and the channel
 * drill-down each had their own copy). That is presentation logic in a repository, tripled, and
 * on the values production actually carries it rendered `Tiktok`, `Ig`, `Chatgpt.com` and
 * `Facebook.com-WebsiteKeyInfo`. Vendor-facing names belong in config, per the house rule that
 * keeps a third party's name out of domain logic.
 *
 * `kind` exists so the UI can style a chip without pattern-matching on the label text — the
 * campaign table previously branched on the literal string `"Direct"`, which silently stopped
 * working the moment the label changed.
 *
 * Adding a platform: add it to `ConvertingPlatform` (src/types/attribution.ts), map its
 * utm_source forms in `SOURCE_ALIASES` (src/services/attribution/normalizePlatform.ts), and add
 * one row here. Nothing else — the Mongo `$switch`, the drill-down predicate and the route enum
 * are all generated. A missing row is a compile error (`Record<ConvertingPlatform, …>`) and is
 * also asserted by `npm run test:normalize-platform`.
 */
import type { ConvertingPlatform } from "@/types/attribution";

export type ChannelKind =
  /** Bought traffic — has ad spend behind it, so ROAS is meaningful. */
  | "paid"
  /** Channels we own the list for; re-engagement rather than acquisition. */
  | "owned"
  /** No utm_source at all — typed the URL, bookmark, stripped referrer. */
  | "unattributed"
  /** Tagged, but with a source we do not model. */
  | "unknown";

export interface ChannelDisplay {
  key: ConvertingPlatform;
  label: string;
  kind: ChannelKind;
  /** Table sort rank: paid spend first, then owned, then the two catch-alls. */
  order: number;
}

export const CHANNEL_DISPLAY: Record<ConvertingPlatform, ChannelDisplay> = {
  // "Facebook / Instagram", not "Meta": Instagram is a placement, not a separate channel —
  // MetaAdInsightsDaily reports ONE spend figure across both, so splitting the revenue while
  // spend stays merged would make ROAS uncomputable for either half. The channel drill-down
  // shows the raw utm_source values that folded in here, so nothing is hidden.
  meta: { key: "meta", label: "Facebook / Instagram", kind: "paid", order: 1 },
  tiktok: { key: "tiktok", label: "TikTok", kind: "paid", order: 2 },
  snapchat: { key: "snapchat", label: "Snapchat", kind: "paid", order: 3 },
  google: { key: "google", label: "Google", kind: "paid", order: 4 },
  klaviyo_email: { key: "klaviyo_email", label: "Klaviyo Email", kind: "owned", order: 5 },
  klaviyo_sms: { key: "klaviyo_sms", label: "Klaviyo SMS", kind: "owned", order: 6 },
  direct: { key: "direct", label: "Direct", kind: "unattributed", order: 7 },
  other: { key: "other", label: "Other", kind: "unknown", order: 8 },
};

/**
 * Every channel key, ordered. Typed as a non-empty tuple so it can feed `z.enum(...)` directly:
 * the drill-down route takes a CLOSED enum rather than a free string, which is what removes the
 * `new RegExp("^" + visitorSuppliedValue + "$")` that used to be built from an unvalidated
 * `utm_source` a visitor could put in the URL.
 */
export const CHANNEL_KEYS = (
  Object.values(CHANNEL_DISPLAY)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.key)
) as [ConvertingPlatform, ...ConvertingPlatform[]];

export function channelLabel(key: ConvertingPlatform): string {
  return CHANNEL_DISPLAY[key]?.label ?? key;
}

export function channelKind(key: ConvertingPlatform): ChannelKind {
  return CHANNEL_DISPLAY[key]?.kind ?? "unknown";
}

export function channelOrder(key: ConvertingPlatform): number {
  return CHANNEL_DISPLAY[key]?.order ?? Number.MAX_SAFE_INTEGER;
}
