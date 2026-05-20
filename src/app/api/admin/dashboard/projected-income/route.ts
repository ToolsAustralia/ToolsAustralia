import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";
import { createAESTDateAsUTC, getStartOfTodayInAEST } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Get the next 27th in AEST: if today (AEST) is before the 27th, use this month's 27th; else next month's 27th.
 * endUTC = 27th 20:00 AEST (8pm AEST/AEDT).
 */
function getNext27thEndUTC(): { endUTC: Date; renewingOn27thDate: Date } {
  const now = new Date();
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);

  let anchorYear = year;
  let anchorMonth = month;
  if (day >= 27) {
    anchorMonth += 1;
    if (anchorMonth > 12) {
      anchorMonth = 1;
      anchorYear += 1;
    }
  }

  const renewingOn27thDate = createAESTDateAsUTC(anchorYear, anchorMonth, 27, 0, 0);
  const endUTC = createAESTDateAsUTC(anchorYear, anchorMonth, 27, 20, 0);
  return { endUTC, renewingOn27thDate };
}

/**
 * Window for "renewing today through 27th": from start of today (midnight AEST) through 27th 8pm AEST/AEDT.
 */
function getTodayThrough27thWindowInUTC(): { startUTC: Date; endUTC: Date; renewingOn27thDate: Date } {
  const startUTC = getStartOfTodayInAEST();
  const { endUTC, renewingOn27thDate } = getNext27thEndUTC();
  return { startUTC, endUTC, renewingOn27thDate };
}

/**
 * GET /api/admin/dashboard/projected-income
 * Get projected income for next month based on active subscriptions with auto-renewal enabled
 *
 * Returns:
 * - projectedIncome: Total expected revenue from subscriptions that will auto-renew
 * - activeSubscriptions: Count of subscriptions that will renew
 * - nextMonthStart, nextMonthEnd: Next month date range (ISO)
 * - renewingOn27thCount, renewingOn27thRevenue, renewingOn27thDate: Users renewing from today through the upcoming 27th (AEST), inclusive
 * - pastDueCount, pastDueRevenue: Past-due subscription counts and at-risk revenue
 */
export async function GET(_request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    // Find users with active subscriptions that WILL auto-renew
    const activeSubscribers = await User.find({
      ...getActiveSubscriptionFilter(),
    }).select("subscription.packageId subscription.autoRenew subscription.endDate");

    // Calculate projected income and active count
    let projectedIncome = 0;
    let activeSubscriptions = 0;

    activeSubscribers.forEach((user) => {
      if (user.subscription?.autoRenew === false) return;
      const packageId = user.subscription?.packageId;
      if (packageId) {
        const pkg = getPackageById(packageId);
        if (pkg && pkg.price) {
          projectedIncome += pkg.price;
          activeSubscriptions++;
        }
      }
    });

    // Renewals from today through the 27th: start of today (midnight AEST) through 27th 8pm AEST/AEDT.
    const { startUTC, endUTC, renewingOn27thDate } = getTodayThrough27thWindowInUTC();
    const renewingOn27thUsers = await User.find({
      ...getActiveSubscriptionFilter(),
      "subscription.endDate": { $gte: startUTC, $lt: endUTC },
    }).select("subscription.packageId subscription.autoRenew");

    let renewingOn27thCount = 0;
    let renewingOn27thRevenue = 0;
    renewingOn27thUsers.forEach((user) => {
      if (user.subscription?.autoRenew === false) return;
      const packageId = user.subscription?.packageId;
      if (packageId) {
        const pkg = getPackageById(packageId);
        if (pkg && pkg.price) {
          renewingOn27thRevenue += pkg.price;
          renewingOn27thCount++;
        }
      }
    });

    // Past due: count and optional revenue (at-risk)
    const pastDueUsers = await User.find({
      "subscription.status": "past_due",
      "subscription.packageId": { $exists: true, $ne: null },
      isActive: true,
    }).select("subscription.packageId");

    let pastDueCount = 0;
    let pastDueRevenue = 0;
    pastDueUsers.forEach((user) => {
      const packageId = user.subscription?.packageId;
      if (packageId) {
        const pkg = getPackageById(packageId);
        if (pkg && pkg.price) {
          pastDueRevenue += pkg.price;
          pastDueCount++;
        }
      }
    });

    // Next month's date range
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    return NextResponse.json({
      success: true,
      data: {
        projectedIncome: Math.round(projectedIncome * 100) / 100,
        activeSubscriptions,
        nextMonthStart: nextMonthStart.toISOString(),
        nextMonthEnd: nextMonthEnd.toISOString(),
        renewingOn27thCount,
        renewingOn27thRevenue: Math.round(renewingOn27thRevenue * 100) / 100,
        renewingOn27thDate: renewingOn27thDate.toISOString(),
        pastDueCount,
        pastDueRevenue: Math.round(pastDueRevenue * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Error fetching projected income:", error);
    return NextResponse.json(
      { error: "Failed to fetch projected income", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
