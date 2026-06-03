// src/utils/tracking/resolved-attribution-metadata.ts
// Stamps the RESOLVED decision into Stripe metadata at the edge, and reads it back in
// the webhook. Keys: attr_platform, attr_confidence, attr_click_id, attr_click_ts.
import type { ConvertingPlatform, AttributionConfidence, ResolveResult } from "@/types/attribution";

export function buildResolvedAttributionMetadata(r: ResolveResult): Record<string, string> {
  const meta: Record<string, string> = {
    attr_platform: r.platform,
    attr_confidence: r.confidence,
  };
  if (r.attributedClickId) meta.attr_click_id = r.attributedClickId.slice(0, 500);
  if (r.attributedClickTimestamp != null) meta.attr_click_ts = String(r.attributedClickTimestamp);
  return meta;
}

export function extractResolvedPlatformFromMetadata(metadata: Record<string, string> | null | undefined): {
  platform: ConvertingPlatform;
  confidence: AttributionConfidence;
  attributedClickId: string | null;
  attributedClickTimestamp: number | null;
} | null {
  if (!metadata?.attr_platform) return null;
  const ts = metadata.attr_click_ts;
  return {
    platform: metadata.attr_platform as ConvertingPlatform,
    confidence: (metadata.attr_confidence as AttributionConfidence) ?? "utm_only",
    attributedClickId: metadata.attr_click_id ?? null,
    attributedClickTimestamp: ts && /^\d+$/.test(ts) ? Number(ts) : null,
  };
}
