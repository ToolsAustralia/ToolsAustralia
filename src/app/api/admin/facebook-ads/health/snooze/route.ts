import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { upsertSnooze } from "@/services/facebook-ads-health/snoozeService";

const bodySchema = z.object({
  adId: z.string().min(1),
  verdict: z.literal("investigate"),
  hours: z.number().int().min(1).max(24),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  await connectDB();
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }
  const userId = session.user?.id;
  if (!userId) return NextResponse.json({ success: false, error: "No user" }, { status: 401 });
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
  try {
    await upsertSnooze({
      userId,
      adAccountId,
      adId: parsed.data.adId,
      verdict: parsed.data.verdict,
      hours: parsed.data.hours,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown" },
      { status: 400 },
    );
  }
}
