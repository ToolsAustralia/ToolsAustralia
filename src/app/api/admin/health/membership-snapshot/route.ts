import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";

const TZ = "Australia/Sydney";
const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"] as const;

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const checkDates: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    checkDates.push(formatInTimeZone(d, TZ, "yyyy-MM-dd"));
  }

  const rows = await MembershipDailySnapshot.find({ date: { $in: checkDates } })
    .select("date packageId")
    .lean();

  const presentByDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!presentByDate.has(r.date)) presentByDate.set(r.date, new Set());
    presentByDate.get(r.date)!.add(r.packageId);
  }

  const missingDays: Array<{ date: string; missingPackages: string[] }> = [];
  for (const date of checkDates) {
    const present = presentByDate.get(date) ?? new Set();
    const missing = SUBSCRIPTION_PACKAGE_IDS.filter((id) => !present.has(id));
    if (missing.length > 0) missingDays.push({ date, missingPackages: missing });
  }

  return NextResponse.json({
    ok: missingDays.length === 0,
    checked: checkDates,
    missingDays,
  });
}
