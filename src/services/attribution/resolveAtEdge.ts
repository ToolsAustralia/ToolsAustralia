// src/services/attribution/resolveAtEdge.ts
// Server-side glue: read cookies off the request, resolve, return the decision + the
// Stripe metadata to stamp. Used by every create-* route so resolution lives in ONE place.
import type { NextRequest } from "next/server";
import { extractClickIdsFromRequest } from "@/utils/tracking/click-capture";
import { readAttributionCookieFromRequest } from "@/utils/tracking/attribution-cookie";
import { resolveConvertingPlatform } from "@/services/attribution/resolveConvertingPlatform";
import { buildResolvedAttributionMetadata } from "@/utils/tracking/resolved-attribution-metadata";
import type { ResolveResult } from "@/types/attribution";

export function resolveAttributionAtEdge(request: NextRequest): {
  decision: ResolveResult;
  metadata: Record<string, string>;
} {
  try {
    const clicks = extractClickIdsFromRequest(request);
    const attr = readAttributionCookieFromRequest(request);
    const decision = resolveConvertingPlatform({
      clicks,
      utm: attr ? { utm_source: attr.utm_source, utm_medium: attr.utm_medium } : undefined,
      utmCapturedAt: attr?.capturedAt ?? null,
      now: Date.now(),
    });
    return { decision, metadata: buildResolvedAttributionMetadata(decision) };
  } catch {
    const decision: ResolveResult = {
      platform: "direct", confidence: "utm_only",
      attributedClickId: null, attributedClickTimestamp: null, windowDays: null, observedTouches: [],
    };
    return { decision, metadata: { attr_platform: "direct", attr_confidence: "utm_only" } };
  }
}
