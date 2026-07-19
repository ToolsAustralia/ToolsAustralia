// src/services/attribution/resolveConvertingPlatform.ts
// Pure, total, never-throws resolver. Unified recency race + fallbacks.
//
// A click (or owned-channel touch) with capturedAt === null cannot win the recency race —
// we can't trust its recency — so it degrades to the utm fallback (guards the fbc Date.now()
// fallback). Owned channels (Klaviyo email/SMS) compete on recency in the SAME race as paid
// clicks (product decision — see platformPriority.ts): a more-recent Klaviyo last-touch wins
// over an older paid click, so Klaviyo's true last-touch performance is measured. On an exact
// recency TIE, the real paid click (confidence "click") outranks an owned utm-only touch.
import type { AttributionConfidence, ConvertingPlatform, ResolveInput, ResolveResult } from "@/types/attribution";
import { windowDaysFor, isOwnedChannel } from "./platformPriority";
import { normalizeUtmToPlatform } from "./normalizePlatform";

const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  platform: ConvertingPlatform;
  clickId: string | null;
  capturedAt: number;
  windowDays: number;
  confidence: Exclude<AttributionConfidence, "inferred_backfill">;
};

export function resolveConvertingPlatform(input: ResolveInput): ResolveResult {
  const { clicks, utm, utmCapturedAt, lastTouchUtm, lastTouchUtmCapturedAt, now } = input;

  const observedTouches: ResolveResult["observedTouches"] = [];
  const eligible: Candidate[] = [];

  // Paid clicks (confidence "click").
  for (const c of clicks) {
    const windowDays = windowDaysFor(c.platform) ?? 7;
    const inWindow =
      c.capturedAt != null && now - c.capturedAt <= windowDays * DAY_MS && now - c.capturedAt >= 0;
    observedTouches.push({
      platform: c.platform,
      clickIdPresent: !!c.clickId,
      capturedAt: c.capturedAt,
      inWindow,
    });
    if (c.capturedAt != null && inWindow) {
      eligible.push({ platform: c.platform, clickId: c.clickId, capturedAt: c.capturedAt, windowDays, confidence: "click" });
    }
  }

  // Owned-channel (Klaviyo email/SMS) LAST touch — competes on recency in the same race,
  // resolving via last-touch UTM with confidence "utm_only" (no click id). Requires a
  // trustworthy last-touch capturedAt to enter the race; a null timestamp degrades to the
  // no-timestamp owned fallback below.
  const lastPlatform = normalizeUtmToPlatform(lastTouchUtm?.utm_source, lastTouchUtm?.utm_medium);
  if (isOwnedChannel(lastPlatform) && lastTouchUtmCapturedAt != null) {
    const windowDays = windowDaysFor(lastPlatform!) ?? 5;
    const inWindow =
      now - lastTouchUtmCapturedAt <= windowDays * DAY_MS && now - lastTouchUtmCapturedAt >= 0;
    observedTouches.push({
      platform: lastPlatform!,
      clickIdPresent: false,
      capturedAt: lastTouchUtmCapturedAt,
      inWindow,
    });
    if (inWindow) {
      eligible.push({ platform: lastPlatform!, clickId: null, capturedAt: lastTouchUtmCapturedAt, windowDays, confidence: "utm_only" });
    }
  }

  if (eligible.length > 0) {
    eligible.sort((a, b) => {
      if (b.capturedAt !== a.capturedAt) return b.capturedAt - a.capturedAt; // most-recent wins
      // Exact recency tie → the real paid click (has a click id) outranks an owned utm-only touch.
      return (a.confidence === "click" ? 0 : 1) - (b.confidence === "click" ? 0 : 1);
    });
    const win = eligible[0];
    return {
      platform: win.platform,
      confidence: win.confidence,
      attributedClickId: win.clickId,
      attributedClickTimestamp: win.capturedAt,
      windowDays: win.windowDays,
      observedTouches,
    };
  }

  // Owned-channel LAST touch WITHOUT a trustworthy timestamp: still ranks above the durable
  // first-touch cookie (a Klaviyo recipient is a returning user whose first touch is some
  // earlier source, which would otherwise bury the conversion). Honors the channel window.
  if (isOwnedChannel(lastPlatform)) {
    const windowDays = windowDaysFor(lastPlatform!);
    const withinWindow =
      windowDays == null ||
      lastTouchUtmCapturedAt == null ||
      (now - lastTouchUtmCapturedAt <= windowDays * DAY_MS && now - lastTouchUtmCapturedAt >= 0);
    if (withinWindow) {
      return {
        platform: lastPlatform!,
        confidence: "utm_only",
        attributedClickId: null,
        attributedClickTimestamp: lastTouchUtmCapturedAt ?? null,
        windowDays: windowDays ?? null,
        observedTouches,
      };
    }
  }

  // Fallback: normalized FIRST-touch utm_source (+ medium). Tier-2 owned channels resolve here too,
  // honoring their window against utmCapturedAt.
  const utmPlatform = normalizeUtmToPlatform(utm?.utm_source, utm?.utm_medium);
  if (utmPlatform && utmPlatform !== "other") {
    const windowDays = windowDaysFor(utmPlatform);
    const withinUtmWindow =
      windowDays == null ||
      utmCapturedAt == null ||
      (now - utmCapturedAt <= windowDays * DAY_MS && now - utmCapturedAt >= 0);
    if (withinUtmWindow) {
      return {
        platform: utmPlatform,
        confidence: "utm_only",
        attributedClickId: null,
        attributedClickTimestamp: utmCapturedAt ?? null,
        windowDays: windowDays ?? null,
        observedTouches,
      };
    }
  }

  // present-but-unrecognized source → "other"; recognized-but-expired or absent → "direct".
  const finalPlatform: ConvertingPlatform = utmPlatform === "other" ? "other" : "direct";
  return {
    platform: finalPlatform,
    confidence: "utm_only",
    attributedClickId: null,
    attributedClickTimestamp: null,
    windowDays: null,
    observedTouches,
  };
}
