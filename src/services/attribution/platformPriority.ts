// src/services/attribution/platformPriority.ts
// The single ordered priority+window table that drives resolution. Adding a platform
// = add one row. Tier 1 (paid clicks) outrank Tier 2 (owned channels). Within a tier,
// most-recent capturedAt wins. Windows are OUR internal click-validity windows,
// independent of each vendor's self-reported dashboard windows.
import type { ConvertingPlatform } from "@/types/attribution";

export type AttributionTier = 1 | 2; // 1 = paid clicks, 2 = owned channels

export interface PlatformRule {
  platform: ConvertingPlatform;
  tier: AttributionTier;
  windowDays: number;
}

export const PLATFORM_PRIORITY: PlatformRule[] = [
  { platform: "meta", tier: 1, windowDays: 7 },
  { platform: "tiktok", tier: 1, windowDays: 7 },
  { platform: "snapchat", tier: 1, windowDays: 7 },
  { platform: "google", tier: 1, windowDays: 7 }, // reserved (gclid capture deferred)
  { platform: "klaviyo_email", tier: 2, windowDays: 5 },
  { platform: "klaviyo_sms", tier: 2, windowDays: 5 }, // 5d = Klaviyo SMS *click* default
];

export function windowDaysFor(platform: ConvertingPlatform): number | null {
  return PLATFORM_PRIORITY.find((r) => r.platform === platform)?.windowDays ?? null;
}

/** Owned channels (tier 2 — Klaviyo email/SMS). These resolve LAST-touch, paid clicks resolve first. */
export function isOwnedChannel(platform: ConvertingPlatform | null): boolean {
  return PLATFORM_PRIORITY.find((r) => r.platform === platform)?.tier === 2;
}
