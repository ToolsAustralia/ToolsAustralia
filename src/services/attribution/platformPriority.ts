// src/services/attribution/platformPriority.ts
// The single priority+window table that drives resolution. ALL channels here compete on
// recency — most-recent capturedAt wins — regardless of paid vs owned.
//
// Product decision (2026-07): owned channels (Klaviyo email/SMS) compete on recency at the
// SAME level as paid clicks, so an owned touch that is MORE RECENT than a paid ad click wins
// the conversion. This is what lets us measure Klaviyo's true last-touch performance instead
// of always burying it beneath any in-window paid click. The only remaining paid-vs-owned
// distinction is CONFIDENCE + resolution source: paid channels resolve via a click id
// ("click"); owned channels resolve via last-touch UTM and have no click id ("utm_only").
// On an exact recency TIE, the real paid click wins (see resolveConvertingPlatform).
//
// Windows are OUR internal click-validity windows, independent of each vendor's self-reported
// dashboard windows. Adding a channel = add one row.
import type { ConvertingPlatform } from "@/types/attribution";

export interface PlatformRule {
  platform: ConvertingPlatform;
  windowDays: number;
  /** true = resolves via last-touch UTM, no click id, confidence "utm_only" (Klaviyo email/SMS). */
  owned: boolean;
}

export const PLATFORM_PRIORITY: PlatformRule[] = [
  { platform: "meta", windowDays: 7, owned: false },
  { platform: "tiktok", windowDays: 7, owned: false },
  { platform: "snapchat", windowDays: 7, owned: false },
  { platform: "google", windowDays: 7, owned: false }, // reserved (gclid capture deferred)
  { platform: "klaviyo_email", windowDays: 5, owned: true },
  { platform: "klaviyo_sms", windowDays: 5, owned: true }, // 5d = Klaviyo SMS *click* default
];

export function windowDaysFor(platform: ConvertingPlatform): number | null {
  return PLATFORM_PRIORITY.find((r) => r.platform === platform)?.windowDays ?? null;
}

/**
 * Owned channels (Klaviyo email/SMS) resolve via LAST-touch UTM (no click id). They now
 * compete on recency alongside paid clicks; this flag only marks their resolution source /
 * confidence, not a lower priority.
 */
export function isOwnedChannel(platform: ConvertingPlatform | null): boolean {
  return PLATFORM_PRIORITY.find((r) => r.platform === platform)?.owned === true;
}
