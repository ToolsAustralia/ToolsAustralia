// src/services/attribution/resolveConvertingPlatform.ts
// Pure, total, never-throws resolver. Priority ladder + recency tiebreak.
// A click with capturedAt === null cannot win as a "click" (we can't trust its recency;
// guards the fbc Date.now() fallback) — it degrades to the utm fallback.
import type { ConvertingPlatform, ResolveInput, ResolveResult } from "@/types/attribution";
import { windowDaysFor, isOwnedChannel } from "./platformPriority";
import { normalizeUtmToPlatform } from "./normalizePlatform";

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveConvertingPlatform(input: ResolveInput): ResolveResult {
  const { clicks, utm, utmCapturedAt, lastTouchUtm, lastTouchUtmCapturedAt, now } = input;

  const observedTouches: ResolveResult["observedTouches"] = [];

  const eligible: Array<{ platform: ConvertingPlatform; clickId: string; capturedAt: number; windowDays: number }> = [];
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
      eligible.push({ platform: c.platform, clickId: c.clickId, capturedAt: c.capturedAt, windowDays });
    }
  }

  if (eligible.length > 0) {
    eligible.sort((a, b) => b.capturedAt - a.capturedAt); // most-recent wins within paid tier
    const win = eligible[0];
    return {
      platform: win.platform,
      confidence: "click",
      attributedClickId: win.clickId,
      attributedClickTimestamp: win.capturedAt,
      windowDays: win.windowDays,
      observedTouches,
    };
  }

  // Owned-channel LAST touch (tier 2 — Klaviyo email/SMS). Ranks below paid clicks but ABOVE the
  // first-touch fallback: a Klaviyo recipient is a returning user whose first touch is some earlier
  // source, so the durable first-touch cookie would otherwise bury the conversion in `direct`/that
  // earlier source. Honors the channel's own window against the last-touch capturedAt.
  const lastPlatform = normalizeUtmToPlatform(lastTouchUtm?.utm_source, lastTouchUtm?.utm_medium);
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
