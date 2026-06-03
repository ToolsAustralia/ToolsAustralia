import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getOrInitSettings, updateSettings } from "@/services/facebook-ads-health/settingsService";

export async function GET() {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  await connectDB();
  const settings = await getOrInitSettings();
  return NextResponse.json({ success: true, settings });
}

const putSchema = z.object({
  breakevenRoas: z.number().min(0).max(10).optional(),
  targetCpaAud: z.number().min(1).max(10000).optional(),
  zeroConvSpendMultiplier: z.number().min(0.5).max(10).optional(),
  roasDropTriggerPct: z.number().min(5).max(95).optional(),
  postEditWaitHours: z.number().int().min(1).max(168).optional(),
  spendIncreaseAlertPct: z.number().min(1).max(1000).optional(),
});

export async function PUT(request: NextRequest) {
  const guard = await requirePermission("facebookAds.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  await connectDB();
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }
  const userId = session.user?.id;
  const userEmail = session.user?.email ?? "";
  const userRoleName =
    session.user?.userType === "admin"
      ? "admin"
      : (session.user as { roleName?: string } | undefined)?.roleName ?? session.user?.role ?? "staff";
  if (!userId) return NextResponse.json({ success: false, error: "No user" }, { status: 401 });
  const settings = await updateSettings({ values: parsed.data, userId, userEmail, userRoleName });
  return NextResponse.json({ success: true, settings });
}
