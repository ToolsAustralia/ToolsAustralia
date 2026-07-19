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
// Recovery covers two persisted-signal classes, with different strictness:
//   - OWNED channels (Klaviyo email/SMS): recovered leniently — unknown recency still
//     counts (signup-era Klaviyo data predates touch timestamps).
//   - PAID platforms (meta/tiktok/snapchat/google): recovered STRICTLY — only when the
//     touch is affirmatively inside the platform's click window (both timestamps known).
//     The edge is cookie-only, so a fresh paid touch is invisible to it whenever the
//     durable cookie is missing at PI-creation time (in-app-browser signup → external
//     browser checkout, Safari ITP, cookie blockers). Measured 2026-07-19: 272
//     direct-bucketed purchases in 30 days carried a paid utm_source (~$9.0k); ~1/3 were
//     within the 7d window — including a same-session signup→purchase off a Meta
//     retargeting ad. A stale or undatable paid UTM still stays `direct` — we never
//     resurrect a paid touch we cannot date.
//
// RECENCY WINDOW: a persisted owned-channel touch is only credited when it is recent
// enough to plausibly have driven the purchase — the same per-channel window the cookie
// resolver enforces (`windowDaysFor`, 5d for Klaviyo). This is what keeps the data
// truthful: a user who signed up via a Klaviyo click months ago, then returns with no
// fresh click and buys, is `direct` — not Klaviyo. The window is checked against the
// best persisted anchor for the touch time:
//   - session-carried UTM (client payload / subscription metadata) → `persistedTouchAt = null`.
//     UNDATABLE by construction: the client's payload prefers the 90-day first-touch
//     `_ta_attr` cookie with `capturedAt` STRIPPED, and renewals re-carry the frozen
//     initial-checkout metadata — dating these `now` would fabricate freshness (and
//     flip every renewal). Null keeps the lenient owned recovery working while the
//     strict paid recovery stays off.
//   - touch carried from signup → `persistedTouchAt = resolveSignupTouchAtMs(...)`:
//     `signupAttribution.visitedAt` (the ad-landing capture time) with `user.createdAt`
//     as the legacy fallback. Paid recovery therefore fires only within the platform
//     window of the captured AD VISIT — not of account creation, which buried
//     returning members converting off retargeting ads (fixed 2026-07-19).
// Pass `now` to enable the window; omit it for legacy non-windowed resolution.
import type { ConvertingPlatform, AttributionConfidence } from "@/types/attribution";
import { normalizeUtmToPlatform } from "./normalizePlatform";
import { isOwnedChannel, windowDaysFor } from "./platformPriority";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve the epoch-ms anchor for a SIGNUP-persisted touch: the **ad-landing capture
 * time** (`signupAttribution.visitedAt` — stamped when the promo visit that carried
 * the UTM was recorded), falling back to account creation only for legacy records
 * without it. Account age is the WRONG anchor for returning members: a 196-day-old
 * account that clicked a retargeting ad 62 seconds before buying is a FRESH paid
 * touch, not a stale one (2026-07-19 prod audit — BOF retargeting conversions were
 * being buried as `direct`). Registration updates `signupAttribution` in place for
 * existing plain accounts, so `visitedAt` tracks the latest captured ad visit while
 * `createdAt` stays frozen at first signup.
 */
export function resolveSignupTouchAtMs(
  signupVisitedAt: Date | string | number | null | undefined,
  userCreatedAt: Date | string | number | null | undefined
): number | null {
  const visited = signupVisitedAt != null ? new Date(signupVisitedAt).getTime() : NaN;
  if (Number.isFinite(visited)) return visited;
  const created = userCreatedAt != null ? new Date(userCreatedAt).getTime() : NaN;
  return Number.isFinite(created) ? created : null;
}

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

/**
 * Is a persisted PAID-platform touch AFFIRMATIVELY within the platform's click window?
 * Strict by design — the opposite polarity of `isWithinOwnedWindow` on missing data:
 * unknown `now`, unknown `touchAt`, or an unmodeled platform (no window row, e.g.
 * "other") does NOT count. This keeps the original "never resurrect a stale paid UTM"
 * stance intact — a paid touch is only credited when we can prove it is fresh.
 */
function isAffirmativelyWithinPaidWindow(
  platform: ConvertingPlatform,
  touchAt: number | null | undefined,
  now: number | null | undefined
): boolean {
  if (now == null || touchAt == null) return false;
  const windowDays = windowDaysFor(platform);
  if (windowDays == null) return false;
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
   * Epoch ms anchor for when the persisted touch happened (signup → `user.createdAt`;
   * session-carried UTMs are undatable → `null`, see header). Used with `now` to
   * enforce the recency windows. Null → recency unknown: owned channels still credit
   * (lenient), paid platforms never do (strict).
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

  // Edge === "direct" + a persisted PAID-platform UTM: the durable cookie can be missing
  // at PI-creation time even for a fresh paid touch (in-app-browser signup → external
  // browser checkout, ITP, blockers) — the edge then stamps `direct` while the persisted
  // signup/session UTM knows better. Recover it ONLY when affirmatively in-window;
  // stale or undatable paid UTMs stay `direct` (see header note).
  if (
    persisted &&
    !isOwnedChannel(persisted) &&
    isAffirmativelyWithinPaidWindow(persisted, input.persistedTouchAt, input.now)
  ) {
    return { platform: persisted, confidence: "utm_only" };
  }

  return { platform: "direct", confidence: edgeConfidence ?? "utm_only" };
}
