import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";
import { formatDateInAEST, getNextMidnightAEST, getTodayThrough27thWindowUTC } from "@/utils/common/timezone";

const VALID_RANGES = [0, 3, 7, 27] as const; // 27 = renewing today through 27th (8pm AEST/AEDT)
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/dashboard/upcoming-renewals?range=0|3|7|27&page=1&limit=50
 * Lists upcoming renewals in the selected window. DB-first: queries User by subscription.endDate in range.
 * Returns paginated list with total count; amounts from package price.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rangeParam = request.nextUrl.searchParams.get("range");
    const range = rangeParam ? parseInt(rangeParam, 10) : 7;
    if (!VALID_RANGES.includes(range as (typeof VALID_RANGES)[number])) {
      return NextResponse.json(
        { error: "Invalid range", validValues: VALID_RANGES },
        { status: 400 }
      );
    }

    const pageParam = request.nextUrl.searchParams.get("page");
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)));

    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;
    if (range === 0) {
      rangeStart = now;
      rangeEnd = getNextMidnightAEST();
    } else if (range === 27) {
      const window = getTodayThrough27thWindowUTC();
      rangeStart = window.startUTC;
      rangeEnd = window.endUTC;
    } else {
      rangeStart = now;
      rangeEnd = new Date(now.getTime() + range * 24 * 60 * 60 * 1000);
    }

    const filter = {
      ...getActiveSubscriptionFilter(),
      "subscription.endDate": { $gte: rangeStart, $lt: rangeEnd },
    };

    const [total, totalRevenueResult, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("subscription.packageId").lean(),
      User.find(filter)
        .select("_id firstName lastName email stripeCustomerId stripeSubscriptionId subscription.packageId subscription.endDate")
        .sort({ "subscription.endDate": 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    let totalRevenue = 0;
    for (const u of totalRevenueResult) {
      const packageId = u.subscription?.packageId as string | undefined;
      const pkg = packageId ? getPackageById(packageId) : undefined;
      if (pkg?.price != null) totalRevenue += pkg.price;
    }

    const renewals = users.map((u) => {
      const endDate = u.subscription?.endDate as Date | undefined;
      const renewalDate = endDate ? new Date(endDate) : new Date(0);
      const renewalDateValid = endDate && Number.isFinite(renewalDate.getTime());
      let renewalDateFormatted = "—";
      if (renewalDateValid && endDate) {
        try {
          renewalDateFormatted = formatDateInAEST(endDate, "MMM d, yyyy h:mm a");
        } catch {
          // ignore
        }
      }
      const packageId = u.subscription?.packageId as string | undefined;
      const pkg = packageId ? getPackageById(packageId) : undefined;
      const amountCents = pkg?.price != null ? Math.round(pkg.price * 100) : 0;
      const uid = (u._id as { toString: () => string }).toString();
      return {
        subscriptionId: (u.stripeSubscriptionId as string) || "",
        customerId: (u.stripeCustomerId as string) || "",
        customerEmail: u.email as string,
        customerName: [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
        userId: uid,
        renewalDate: renewalDateValid ? renewalDate.toISOString() : "",
        renewalDateFormatted,
        amountCents,
        amountFormatted: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amountCents / 100),
      };
    });

    return NextResponse.json({
      success: true,
      data: { renewals, total, page, limit, totalRevenue: Math.round(totalRevenue * 100) / 100 },
    });
  } catch (error) {
    console.error("Error fetching upcoming renewals:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch upcoming renewals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
