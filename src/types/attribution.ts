// src/types/attribution.ts
// Shared types for single-platform payment attribution. Imported by the resolver,
// capture helpers, metadata codec, the PaymentEvent model, and the dashboard.

export type ConvertingPlatform =
  | "meta" | "tiktok" | "snapchat"
  | "klaviyo_email" | "klaviyo_sms"
  | "google" | "direct" | "other";

export type AttributionConfidence = "click" | "utm_only" | "inferred_backfill";

/** A paid-click signal observed at capture time. capturedAt = epoch ms, or null if unknown. */
export interface PaidClickSignal {
  platform: "meta" | "tiktok" | "snapchat" | "google";
  clickId: string;
  capturedAt: number | null;
}

export interface ResolveInput {
  clicks: PaidClickSignal[];
  /** FIRST-touch UTM (durable `_ta_attr` cookie). Used for paid-via-UTM + as the final fallback. */
  utm?: { utm_source?: string; utm_medium?: string };
  utmCapturedAt?: number | null;
  /**
   * LAST-touch UTM (overwriting `_ta_attr_last` cookie). Owned channels (Klaviyo email/SMS) are a
   * re-engagement channel, so they MUST resolve last-touch — the first-touch cookie almost always
   * holds the earlier acquisition source, which silently buries Klaviyo conversions in `direct`.
   */
  lastTouchUtm?: { utm_source?: string; utm_medium?: string };
  lastTouchUtmCapturedAt?: number | null;
  now: number; // epoch ms
}

export interface ResolveResult {
  platform: ConvertingPlatform;
  confidence: Exclude<AttributionConfidence, "inferred_backfill">; // live resolve is never backfill
  attributedClickId: string | null;
  attributedClickTimestamp: number | null;
  windowDays: number | null;
  observedTouches: Array<{
    platform: string;
    clickIdPresent: boolean;
    capturedAt: number | null;
    inWindow: boolean;
  }>;
}
