import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import Stripe from "stripe";
import mongoose from "mongoose";
import {
  batchFetchCustomers,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
} from "@/server/admin/chargePastDueShared";

type RouteParams = { params: Promise<{ id: string }> };

type LeanChargeUser = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  stripeCustomerId?: string | null;
  subscription?: { status?: string | null } | null;
};

async function loadPastDueUserForCharge(userId: string): Promise<
  | { ok: true; user: LeanChargeUser; customerId: string }
  | { ok: false; status: number; message: string }
> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { ok: false, status: 400, message: "Invalid user ID" };
  }

  const user = await User.findById(userId)
    .select("_id email firstName lastName stripeCustomerId subscription.status")
    .lean<LeanChargeUser | null>();

  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  if (user.subscription?.status !== "past_due") {
    return {
      ok: false,
      status: 400,
      message: "This action only applies when the member's subscription status is past_due in the database.",
    };
  }

  const customerId = user.stripeCustomerId?.trim();
  if (!customerId) {
    return { ok: false, status: 400, message: "User has no Stripe customer ID." };
  }

  return { ok: true, user, customerId };
}

async function listOpenInvoicesForCustomer(customerId: string): Promise<Stripe.Invoice[]> {
  const allInvoices: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore) {
    const invoiceResponse = (await stripe.invoices.list({
      customer: customerId,
      status: "open",
      collection_method: "charge_automatically",
      limit: 100,
      starting_after: startingAfter,
    })) as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>;

    allInvoices.push(...invoiceResponse.data);
    hasMore = invoiceResponse.has_more;

    if (hasMore && invoiceResponse.data.length > 0) {
      startingAfter = invoiceResponse.data[invoiceResponse.data.length - 1].id;
    }
  }

  return allInvoices;
}

/**
 * GET /api/admin/users/[id]/charge-past-due
 * Preview open, chargeable invoices for this member (same eligibility rules as bulk past-due job).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;
    const loaded = await loadPastDueUserForCharge(userId);

    if (!loaded.ok) {
      return NextResponse.json(
        { success: false, error: loaded.message },
        { status: loaded.status }
      );
    }

    const { user, customerId } = loaded;
    const allInvoices = await listOpenInvoicesForCustomer(customerId);
    const customerPaymentMethodMap = await batchFetchCustomers([customerId], 15, 200);

    const filterStats = {
      totalInvoices: allInvoices.length,
      wrongCollectionMethod: 0,
      noAmountRemaining: 0,
      noPaymentMethod: 0,
      noCustomerId: 0,
      notPastDue: 0,
      eligible: 0,
    };

    const preview: Array<{
      invoiceId: string;
      customerId: string;
      userId: string;
      userEmail: string;
      userName: string;
      amount: number;
      currency: string;
    }> = [];

    const userIdStr =
      typeof user._id === "string" ? user._id : String(user._id);
    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A";

    for (const invoice of allInvoices) {
      if (!invoice.id) continue;

      if (invoice.collection_method !== "charge_automatically") {
        filterStats.wrongCollectionMethod++;
        continue;
      }

      if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
        filterStats.noAmountRemaining++;
        continue;
      }

      const invCustomerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!invCustomerId || invCustomerId !== customerId) {
        /** Defensive: list is scoped by customer, but keep stats honest if Stripe ever returns mixed data */
        filterStats.noCustomerId++;
        continue;
      }

      const defaultPm = customerPaymentMethodMap.get(customerId) || null;
      if (!resolveInvoicePaymentMethodId(invoice, defaultPm)) {
        filterStats.noPaymentMethod++;
        continue;
      }

      if (user.subscription?.status !== "past_due") {
        filterStats.notPastDue++;
        continue;
      }

      filterStats.eligible++;
      preview.push({
        invoiceId: invoice.id,
        customerId,
        userId: userIdStr,
        userEmail: user.email || "N/A",
        userName,
        amount: invoice.amount_remaining || 0,
        currency: invoice.currency || "aud",
      });
    }

    return NextResponse.json({
      success: true,
      preview: {
        eligibleCount: preview.length,
        totalInvoices: filterStats.totalInvoices,
        filterStats: {
          wrongCollectionMethod: filterStats.wrongCollectionMethod,
          noAmountRemaining: filterStats.noAmountRemaining,
          noPaymentMethod: filterStats.noPaymentMethod,
          noCustomerId: filterStats.noCustomerId,
          userNotFound: 0,
          notPastDue: filterStats.notPastDue,
        },
        debug: {
          totalCustomerIds: 1,
          totalUsersFound: 1,
          pastDueUsersFound: 1,
        },
        users: preview,
      },
    });
  } catch (error) {
    console.error("Error in GET charge-past-due user:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load preview",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users/[id]/charge-past-due
 * Retry payment for this member's eligible open invoices.
 *
 * Does not use the bulk ChargeJobLock so a single-member retry does not block the full past-due sweep.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminId = session.user.id;
    const body = await request.json();
    if (body.confirmation !== "CHARGE") {
      return NextResponse.json(
        {
          error: "Invalid confirmation",
          message: 'You must type "CHARGE" to confirm this action.',
        },
        { status: 400 }
      );
    }

    const { id: userId } = await params;
    const loaded = await loadPastDueUserForCharge(userId);

    if (!loaded.ok) {
      return NextResponse.json(
        { success: false, error: loaded.message },
        { status: loaded.status }
      );
    }

    const { user, customerId } = loaded;
    const allInvoices = await listOpenInvoicesForCustomer(customerId);
    const customerPaymentMethodMap = await batchFetchCustomers([customerId], 15, 200);

    const eligibleInvoices = allInvoices.filter((invoice) => {
      if (invoice.collection_method !== "charge_automatically") return false;
      if (!invoice.amount_remaining || invoice.amount_remaining <= 0) return false;

      const invCustomerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!invCustomerId || invCustomerId !== customerId) return false;

      const defaultPm = customerPaymentMethodMap.get(customerId) || null;
      if (!resolveInvoicePaymentMethodId(invoice, defaultPm)) return false;

      if (user.subscription?.status !== "past_due") return false;

      return true;
    });

    const results: Awaited<ReturnType<typeof payOpenInvoiceAsPastDueAdmin>>[] = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const invoice of eligibleInvoices) {
      const invCustomerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!invCustomerId) continue;

      const defaultPm = customerPaymentMethodMap.get(customerId) || null;
      const paymentMethodId = resolveInvoicePaymentMethodId(invoice, defaultPm);

      if (!paymentMethodId) {
        skipped++;
        results.push({
          invoiceId: invoice.id || "",
          customerId: invCustomerId,
          userId: String(user._id),
          userEmail: user.email || "N/A",
          status: "skipped",
          skipReason: "No payment method found on invoice or customer",
          amount: invoice.amount_remaining || 0,
        });
        continue;
      }

      const row = await payOpenInvoiceAsPastDueAdmin({
        invoice,
        paymentMethodId,
        customerId: invCustomerId,
        user: { _id: user._id, email: user.email },
        adminId,
      });

      processed++;
      if (row.status === "success") succeeded++;
      else if (row.status === "failed") failed++;
      else skipped++;

      results.push(row);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoices: allInvoices.length,
        processed,
        succeeded,
        failed,
        skipped,
      },
      results,
    });
  } catch (error) {
    console.error("Error in POST charge-past-due user:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process charge",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
