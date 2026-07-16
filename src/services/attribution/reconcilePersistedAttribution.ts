// src/services/attribution/reconcilePersistedAttribution.ts
// Bridges the edge-resolved decision (cookie-only) with the UTM persisted on the
// PaymentEvent (signup/checkout). The edge resolver (resolveAtEdge) only sees the
// request's _ta_attr / _ta_attr_last cookies, so an owned-channel (Klaviyo) touch
// that was captured at SIGNUP and stored on the user is invisible to it — those
// conversions were stamped `direct` and buried, which is the leak the per-cycle
// `backfill-klaviyo-attribution-cycle` script kept correcting after the fact.
//
// Reconciling here makes the LIVE path consider the same persisted owned-channel
// signal the backfill uses, so the two agree and the recurring backfill is no longer
// needed going forward.
//
// Scope is deliberately limited to OWNED channels (Klaviyo email/SMS): any in-window
// paid click OR cookie-visible owned last-touch would already have won the recency race
// at the edge, so an edge result of `direct` genuinely means "no in-window signal the
// cookies could see" — we only recover a persisted owned-channel touch (invisible to the
// cookie-only edge), never resurrect a stale paid UTM. When the edge already resolved a
// positive platform (paid click OR a recency-winning Klaviyo last-touch), we trust it.
//
// RECENCY WINDOW: a persisted owned-channel touch is only credited when it is recent
// enough to plausibly have driven the purchase — the same per-channel window the cookie
// resolver enforces (`windowDaysFor`, 5d for Klaviyo). This is what keeps the data
// truthful: a user who signed up via a Klaviyo click months ago, then returns with no
// fresh click and buys, is `direct` — not Klaviyo. The window is checked against the
// touch's capture time:
//   - touch captured at THIS checkout (session)  → pass `persistedTouchAt = now`
//   - touch carried from signup                  → pass `persistedTouchAt = user.createdAt`
// Pass `now` to enable the window; omit it for legacy non-windowed resolution.
import type { ConvertingPlatform, AttributionConfidence } from "@/types/attribution";
import { normalizeUtmToPlatform } from "./normalizePlatform";
import { isOwnedChannel, windowDaysFor } from "./platformPriority";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Is a persisted owned-channel touch recent enough to count, per the channel's window?
 * - `now == null`  → windowing disabled (legacy callers) → always counts.
 * - `touchAt == null` → recency unknown → counts (don't bury a real signal on missing data).
 * - otherwise → counts only when `0 <= now - touchAt <= windowDays * DAY_MS`.
 */
function isWithinOwnedWindow(
  platform: ConvertingPlatform,
  touchAt: number | null | undefined,
  now: number | null | undefined
): boolean {
  if (now == null) return true;
  if (touchAt == null) return true;
  const windowDays = windowDaysFor(platform);
  if (windowDays == null) return true;
  const age = now - touchAt;
  return age >= 0 && age <= windowDays * DAY_MS;
}

export function reconcilePersistedAttribution(input: {
  /** Platform from the edge-resolved decision (Stripe metadata `attr_platform`). Null when the route stamped none. */
  edgePlatform: ConvertingPlatform | null;
  /** Confidence from the edge-resolved decision. */
  edgeConfidence: AttributionConfidence | null;
  /** utm_source persisted on the PaymentEvent (merged session → signup). */
  persistedUtmSource?: string;
  /** utm_medium persisted on the PaymentEvent (merged session → signup). */
  persistedUtmMedium?: string;
  /**
   * Epoch ms of when the persisted owned-channel touch happened (session → `now`,
   * signup → `user.createdAt`). Used with `now` to enforce the channel recency window.
   * Null → recency unknown (credited rather than buried).
   */
  persistedTouchAt?: number | null;
  /** Epoch ms of the conversion. When provided, the owned-channel recency window is enforced. */
  now?: number;
}): { platform: ConvertingPlatform; confidence: AttributionConfidence } {
  const { edgePlatform, edgeConfidence } = input;
  const persisted = normalizeUtmToPlatform(input.persistedUtmSource, input.persistedUtmMedium);

  // No edge decision at all → fall back to any recognised persisted UTM, else `direct`
  // (preserves the pre-existing UTM fallback behaviour for the no-metadata path).
  if (!edgePlatform) {
    return { platform: persisted ?? "direct", confidence: "utm_only" };
  }

  // Edge produced a positive signal (paid click, or a cookie owned-channel last-touch) → trust it.
  if (edgePlatform !== "direct") {
    return { platform: edgePlatform, confidence: edgeConfidence ?? "utm_only" };
  }

  // Edge === "direct": recover a persisted OWNED-channel (Klaviyo) touch the cookie-only
  // resolver structurally could not see — but only when it is recent enough to count.
  if (isOwnedChannel(persisted) && isWithinOwnedWindow(persisted!, input.persistedTouchAt, input.now)) {
    return { platform: persisted as ConvertingPlatform, confidence: "utm_only" };
  }

  return { platform: "direct", confidence: edgeConfidence ?? "utm_only" };
}
