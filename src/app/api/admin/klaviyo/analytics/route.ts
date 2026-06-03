import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import {
  getKlaviyoAnalytics,
  type KlaviyoAnalytics,
  type KlaviyoTimeframeKey,
} from "@/services/admin/klaviyo/klaviyoReporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/klaviyo/analytics?range=last_30_days
 *
 * Klaviyo-attributed campaign + flow revenue (email/SMS split) + the "scheduled /
 * about to send" view, from the Klaviyo Reporting API (SHARED-2). Gated by
 * `facebookAds.view`.
 *
 * The Klaviyo reporting endpoints are heavily throttled (≈2/min), so results are
 * cached in-process (10-min TTL) and a throttle/error falls back to the last good
 * snapshot with `stale: true`. The tab must NOT auto-refresh on an interval.
 */
const querySchema = z.object({
  range: z.enum(["last_7_days", "last_30_days", "last_90_days", "last_12_months"]).optional().default("last_30_days"),
});

const TTL_MS = 10 * 60 * 1000;
type CacheEntry = { data: KlaviyoAnalytics; fetchedAtMs: number };
const cache = new Map<KlaviyoTimeframeKey, CacheEntry>();

export async function GET(request: NextRequest) {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;

  let range: KlaviyoTimeframeKey;
  try {
    range = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries())).range;
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: e instanceof z.ZodError ? e.issues : "Validation failed" },
      { status: 400 }
    );
  }

  const nowMs = Date.now();
  const cached = cache.get(range);
  if (cached && nowMs - cached.fetchedAtMs < TTL_MS) {
    return NextResponse.json({ success: true, data: cached.data, stale: false, cachedAt: cached.fetchedAtMs });
  }

  try {
    const data = await getKlaviyoAnalytics(range, nowMs);
    cache.set(range, { data, fetchedAtMs: nowMs });
    return NextResponse.json({ success: true, data, stale: false, cachedAt: nowMs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Throttle or transient failure → serve the last good snapshot if we have one.
    if (cached) {
      return NextResponse.json({ success: true, data: cached.data, stale: true, cachedAt: cached.fetchedAtMs, note: message });
    }
    console.error("❌ [klaviyo/analytics] failed with no cache to fall back on:", message);
    const throttled = message.includes("429") || message.toLowerCase().includes("throttl");
    return NextResponse.json(
      { success: false, error: throttled ? "Klaviyo reporting is rate-limited; try again shortly." : "Failed to load Klaviyo analytics", details: message },
      { status: throttled ? 503 : 500 }
    );
  }
}
