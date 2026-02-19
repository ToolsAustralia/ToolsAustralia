import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import { formatDateInAEST, getNextMidnightAEST, getTodayThrough27thWindowUTC } from "@/utils/common/timezone";

const VALID_RANGES = [0, 3, 7, 27, 30] as const; // 27 = renewing today through 27th (5:30pm AEST)

/**
 * GET /api/admin/dashboard/upcoming-renewals?range=3|7|30
 * Lists upcoming renewals in the next N days from:
 * 1) Stripe API (active subscriptions with current_period_end in range)
 * 2) Our DB (users with subscription.endDate in range who will renew)
 * Merged so admins see all expected renewals even if Stripe list is empty or out of sync.
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

    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;
    if (range === 0) {
      rangeStart = now;
      rangeEnd = getNextMidnightAEST(); // "Today": from now until end of today AEST
    } else if (range === 27) {
      const window = getTodayThrough27thWindowUTC();
      rangeStart = window.startUTC;
      rangeEnd = window.endUTC;
    } else {
      rangeStart = now;
      rangeEnd = new Date(now.getTime() + range * 24 * 60 * 60 * 1000);
    }
    const nowSec = Math.floor(rangeStart.getTime() / 1000);
    const endSec = Math.floor(rangeEnd.getTime() / 1000);

    const renewals: Array<{
      subscriptionId: string;
      customerId: string;
      customerEmail?: string;
      customerName?: string;
      userId?: string;
      renewalDate: string;
      renewalDateFormatted: string;
      amountCents: number;
      amountFormatted: string;
    }> = [];

    for await (const sub of stripe.subscriptions.list({
      status: "active",
      limit: 100,
      expand: ["data.customer"],
    })) {
      const periodEndSec = getSubscriptionPeriodEnd(sub);
      if (periodEndSec == null || !Number.isFinite(periodEndSec)) continue;
      if (periodEndSec < nowSec || periodEndSec > endSec) continue;
      const periodEndMs = periodEndSec * 1000;

      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customerId) continue;

      let customerEmail: string | undefined;
      let customerName: string | undefined;
      const customer = sub.customer;
      if (customer && typeof customer === "object" && "email" in customer) {
        customerEmail = customer.email ?? undefined;
        customerName = customer.name ?? undefined;
      }

      let amountCents = 0;
      try {
        const upcoming = await (stripe.invoices as unknown as { retrieveUpcoming: (opts: { subscription: string }) => Promise<{ amount_due?: number }> }).retrieveUpcoming({
          subscription: sub.id,
        });
        amountCents = upcoming.amount_due ?? 0;
      } catch {
        if (sub.items?.data?.length) {
          amountCents = sub.items.data.reduce((sum, item) => sum + (item.plan?.amount ?? item.price?.unit_amount ?? 0) * (item.quantity ?? 1), 0);
        }
      }

      const renewalDate = new Date(periodEndMs);
      const renewalDateValid = Number.isFinite(renewalDate.getTime());
      let renewalDateFormatted = "—";
      if (renewalDateValid) {
        try {
          renewalDateFormatted = formatDateInAEST(renewalDate, "MMM d, yyyy h:mm a");
        } catch {
          // formatter can throw for out-of-range or invalid dates
        }
      }

      let userId: string | undefined;
      const user = await User.findOne({ stripeCustomerId: customerId }).select("_id").lean();
      if (user) userId = user._id.toString();

      renewals.push({
        subscriptionId: sub.id,
        customerId,
        customerEmail,
        customerName,
        userId,
        renewalDate: renewalDateValid ? renewalDate.toISOString() : "",
        renewalDateFormatted,
        amountCents,
        amountFormatted: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amountCents / 100),
      });
    }

    const userIdsFromStripe = new Set(renewals.map((r) => r.userId).filter(Boolean));

    // DB users with endDate in range (will renew)
    const dbUsersWithEndDate = await User.find({
      ...getActiveSubscriptionFilter(),
      "subscription.endDate": { $gte: rangeStart, $lte: rangeEnd },
    })
      .select("_id firstName lastName email stripeCustomerId stripeSubscriptionId subscription.packageId subscription.endDate")
      .lean();

    for (const u of dbUsersWithEndDate) {
      const uid = (u._id as { toString: () => string }).toString();
      if (userIdsFromStripe.has(uid)) continue;

      const endDate = u.subscription?.endDate as Date | undefined;
      if (!endDate) continue;

      const renewalDate = new Date(endDate);
      const renewalDateValid = Number.isFinite(renewalDate.getTime());
      let renewalDateFormatted = "—";
      if (renewalDateValid) {
        try {
          renewalDateFormatted = formatDateInAEST(renewalDate, "MMM d, yyyy h:mm a");
        } catch {
          // ignore
        }
      }

      const packageId = u.subscription?.packageId as string | undefined;
      const pkg = packageId ? getPackageById(packageId) : undefined;
      const amountCents = pkg?.price != null ? Math.round(pkg.price * 100) : 0;

      renewals.push({
        subscriptionId: (u.stripeSubscriptionId as string) || "",
        customerId: (u.stripeCustomerId as string) || "",
        customerEmail: u.email as string,
        customerName: [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
        userId: uid,
        renewalDate: renewalDateValid ? renewalDate.toISOString() : "",
        renewalDateFormatted,
        amountCents,
        amountFormatted: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amountCents / 100),
      });
    }

    // Will-renew users without endDate in our DB: get renewal date from Stripe so we still show them
    const userIdsNow = new Set(renewals.map((r) => r.userId).filter(Boolean));
    const dbUsersNoEndDate = await User.find({
      ...getActiveSubscriptionFilter(),
      stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
      $or: [
        { "subscription.endDate": { $exists: false } },
        { "subscription.endDate": null },
        { "subscription.endDate": { $lt: now } },
        { "subscription.endDate": { $gt: rangeEnd } },
      ],
    })
      .select("_id firstName lastName email stripeCustomerId stripeSubscriptionId subscription.packageId")
      .lean();

    for (const u of dbUsersNoEndDate) {
      const uid = (u._id as { toString: () => string }).toString();
      if (userIdsNow.has(uid)) continue;

      const subId = u.stripeSubscriptionId as string;
      if (!subId) continue;

      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        const periodEndSec = getSubscriptionPeriodEnd(sub);
        if (periodEndSec == null || !Number.isFinite(periodEndSec)) continue;
        if (periodEndSec < nowSec || periodEndSec > endSec) continue;
        const periodEndMs = periodEndSec * 1000;

        const renewalDate = new Date(periodEndMs);
        const renewalDateValid = Number.isFinite(renewalDate.getTime());
        let renewalDateFormatted = "—";
        if (renewalDateValid) {
          try {
            renewalDateFormatted = formatDateInAEST(renewalDate, "MMM d, yyyy h:mm a");
          } catch {
            // ignore
          }
        }

        let amountCents = 0;
        try {
          const upcoming = await (stripe.invoices as unknown as { retrieveUpcoming: (opts: { subscription: string }) => Promise<{ amount_due?: number }> }).retrieveUpcoming({ subscription: subId });
          amountCents = upcoming.amount_due ?? 0;
        } catch {
          const pkg =
            u.subscription?.packageId != null ? getPackageById(String(u.subscription.packageId)) : undefined;
          amountCents = pkg?.price != null ? Math.round(pkg.price * 100) : 0;
        }

        renewals.push({
          subscriptionId: subId,
          customerId: (u.stripeCustomerId as string) || "",
          customerEmail: u.email as string,
          customerName: [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
          userId: uid,
          renewalDate: renewalDateValid ? renewalDate.toISOString() : "",
          renewalDateFormatted,
          amountCents,
          amountFormatted: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amountCents / 100),
        });
        userIdsNow.add(uid);
      } catch {
        // Stripe fetch failed for this sub, skip
      }
    }

    renewals.sort((a, b) => {
      const ta = a.renewalDate ? new Date(a.renewalDate).getTime() : 0;
      const tb = b.renewalDate ? new Date(b.renewalDate).getTime() : 0;
      return Number.isFinite(ta) && Number.isFinite(tb) ? ta - tb : 0;
    });

    return NextResponse.json({
      success: true,
      data: { renewals },
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
