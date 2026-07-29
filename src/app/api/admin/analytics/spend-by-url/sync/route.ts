import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import {
  metaSpendByUrlDescriptor,
  runSpendByUrlSync,
  tiktokSpendByUrlDescriptor,
  type RunSpendByUrlSyncResult,
  type SpendByUrlSyncDescriptor,
} from "@/services/analytics/runSpendByUrlSync";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** "all" syncs every configured platform — matches the Prize performance card's default. */
  platform: z.enum(["meta", "tiktok", "all"]).default("meta"),
});

/**
 * POST /api/admin/analytics/spend-by-url/sync
 * Body: { startDate, endDate, platform? } — pulls insights, resolves destinations, recomputes
 * aggregates for the requested platform(s).
 *
 * Platforms run SEQUENTIALLY, not in parallel: each is an external API pull inside one
 * 300s invocation, and a parallel pair doubles peak memory and rate-limit pressure for no
 * wall-clock win worth the risk. A platform that isn't configured is skipped (reported as
 * `configured: false`), never an error — syncing Meta must not fail because TikTok is absent.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("facebookAds.edit", request);
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { startDate, endDate, platform } = parsed.data;
    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, error: "startDate must be on or before endDate" },
        { status: 400 }
      );
    }

    const descriptors: SpendByUrlSyncDescriptor[] = [];
    if (platform === "meta" || platform === "all") {
      const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
      const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
      if (adAccountId && accessToken) {
        descriptors.push(metaSpendByUrlDescriptor(adAccountId, accessToken));
      } else if (platform === "meta") {
        return NextResponse.json(
          { success: false, error: "Facebook Marketing API env vars not configured" },
          { status: 500 }
        );
      }
    }
    if (platform === "tiktok" || platform === "all") {
      const tiktok = tiktokSpendByUrlDescriptor();
      if (tiktok) {
        descriptors.push(tiktok);
      } else if (platform === "tiktok") {
        return NextResponse.json(
          { success: false, error: "TIKTOK_ADVERTISER_ID not configured" },
          { status: 500 }
        );
      }
    }

    if (descriptors.length === 0) {
      return NextResponse.json(
        { success: false, error: "No ad platform is configured in this environment" },
        { status: 500 }
      );
    }

    const results: RunSpendByUrlSyncResult[] = [];
    for (const descriptor of descriptors) {
      results.push(await runSpendByUrlSync(descriptor, { since: startDate, until: endDate }));
    }

    await log(200);
    // `data` keeps the original single-platform shape so existing callers are unaffected;
    // `platforms` carries the full per-platform detail.
    return NextResponse.json({
      success: true,
      data: results[0],
      platforms: results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("spend-by-url sync POST:", e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
