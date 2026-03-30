import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import ChargeJobLock from "@/models/ChargeJobLock";
import Stripe from "stripe";
import mongoose from "mongoose";
import {
  batchFetchCustomers,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
} from "@/server/admin/chargePastDueShared";

/**
 * GET /api/admin/invoices/charge-past-due
 * Preview eligible invoices/users that will be charged (no actual charging)
 */
export async function GET(_request: NextRequest) {
  try {
    await connectDB();

    // 1. Admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch eligible invoices from Stripe with pagination
    // Use explicit ordering for consistent results
    const allInvoices: Stripe.Invoice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const invoiceResponse = await stripe.invoices.list({
        status: "open",
        collection_method: "charge_automatically",
        limit: 100,
        starting_after: startingAfter,
      }) as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>;

      allInvoices.push(...invoiceResponse.data);
      hasMore = invoiceResponse.has_more;
      
      if (hasMore && invoiceResponse.data.length > 0) {
        startingAfter = invoiceResponse.data[invoiceResponse.data.length - 1].id;
      }
    }

    // 3. Map invoices to MongoDB users
    const customerIds = allInvoices
      .map((inv) => (typeof inv.customer === "string" ? inv.customer : inv.customer?.id))
      .filter(Boolean) as string[];

    // Get all users with these customer IDs (for debugging)
    const allUsers = await User.find({
      stripeCustomerId: { $in: customerIds },
    })
      .select("_id email firstName lastName stripeCustomerId subscription.status")
      .lean();

    // Get users with past_due status
    const pastDueUsers = await User.find({
      stripeCustomerId: { $in: customerIds },
      "subscription.status": "past_due",
    })
      .select("_id email firstName lastName stripeCustomerId subscription.status")
      .lean();

    const userMap = new Map(pastDueUsers.map((u) => [u.stripeCustomerId, u]));

    // 4. Batch fetch customers to get their default payment methods (fallback)
    // Uses throttled batching with retry logic to respect Stripe rate limits
    const customerPaymentMethodMap = await batchFetchCustomers(customerIds, 15, 200);

    // 5. Filter invoices and build preview
    const filterStats = {
      totalInvoices: allInvoices.length,
      wrongCollectionMethod: 0,
      noAmountRemaining: 0,
      noPaymentMethod: 0,
      noCustomerId: 0,
      userNotFound: 0,
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

    for (const invoice of allInvoices) {
      // Skip if no invoice ID
      if (!invoice.id) {
        continue;
      }

      // Check collection method
      if (invoice.collection_method !== "charge_automatically") {
        filterStats.wrongCollectionMethod++;
        continue;
      }

      // Check amount remaining
      if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
        filterStats.noAmountRemaining++;
        continue;
      }

      // Check database status first (to get customerId)
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) {
        filterStats.noCustomerId++;
        continue;
      }

      const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
      const hasPaymentMethod = !!resolveInvoicePaymentMethodId(invoice, customerPaymentMethod);

      if (!hasPaymentMethod) {
        filterStats.noPaymentMethod++;
        continue;
      }

      const user = userMap.get(customerId);
      if (!user) {
        filterStats.userNotFound++;
        continue;
      }

      if (user.subscription?.status !== "past_due") {
        filterStats.notPastDue++;
        continue;
      }

      // Eligible invoice
      filterStats.eligible++;
      const userId: string = user._id 
        ? (typeof user._id === "string" 
            ? user._id 
            : String(user._id))
        : "";
      
      preview.push({
        invoiceId: invoice.id,
        customerId: customerId,
        userId,
        userEmail: user.email || "N/A",
        userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A",
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
          userNotFound: filterStats.userNotFound,
          notPastDue: filterStats.notPastDue,
        },
        debug: {
          totalCustomerIds: customerIds.length,
          totalUsersFound: allUsers.length,
          pastDueUsersFound: pastDueUsers.length,
        },
        users: preview,
      },
    });
  } catch (error) {
    console.error("Error fetching preview:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch preview",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/invoices/charge-past-due
 * Bulk charge past_due invoices with comprehensive security and error handling
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // 1. Admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminId = session.user.id;

    // 2. Confirmation validation
    const body = await request.json();
    if (body.confirmation !== "CHARGE") {
      return NextResponse.json(
        { error: "Invalid confirmation", message: 'You must type "CHARGE" to confirm this action.' },
        { status: 400 }
      );
    }

    // 3. Global mutex lock check
    const lock = await ChargeJobLock.findById("charge-job-lock");
    const now = new Date();

    if (lock && lock.isLocked) {
      // Check if lock has expired
      if (lock.lockedUntil && new Date(lock.lockedUntil) > now) {
        return NextResponse.json(
          {
            error: "Operation in progress",
            message: "Another admin is currently running this operation. Please try again later.",
          },
          { status: 409 }
        );
      } else {
        // Lock expired, release it
        lock.isLocked = false;
        await lock.save();
      }
    }

    // Acquire lock
    if (!lock) {
      await ChargeJobLock.create({
        _id: "charge-job-lock",
        isLocked: true,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        lockedBy: new mongoose.Types.ObjectId(adminId),
        lockedAt: now,
      });
    } else {
      lock.isLocked = true;
      lock.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      lock.lockedBy = new mongoose.Types.ObjectId(adminId);
      lock.lockedAt = now;
      await lock.save();
    }

    try {
      // 4. Fetch eligible invoices from Stripe with pagination
      // Note: Stripe invoices don't have "past_due" status - that's a subscription status
      // We fetch "open" invoices and filter by database subscription status
      // Use pagination to ensure we get all invoices consistently
      const allInvoices: Stripe.Invoice[] = [];
      let hasMore = true;
      let startingAfter: string | undefined = undefined;

      while (hasMore) {
        const invoiceResponse = await stripe.invoices.list({
          status: "open",
          collection_method: "charge_automatically",
          limit: 100,
          starting_after: startingAfter,
        }) as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>;

        allInvoices.push(...invoiceResponse.data);
        hasMore = invoiceResponse.has_more;
        
        if (hasMore && invoiceResponse.data.length > 0) {
          startingAfter = invoiceResponse.data[invoiceResponse.data.length - 1].id;
        }
      }

      if (allInvoices.length === 0) {
        // Release lock
        await ChargeJobLock.findByIdAndUpdate("charge-job-lock", {
          isLocked: false,
        });

        return NextResponse.json({
          success: true,
          summary: {
            totalInvoices: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
          },
          results: [],
        });
      }

      // 5. Map invoices to MongoDB users
      const customerIds = allInvoices
        .map((inv) => (typeof inv.customer === "string" ? inv.customer : inv.customer?.id))
        .filter(Boolean) as string[];

      const users = await User.find({
        stripeCustomerId: { $in: customerIds },
        "subscription.status": "past_due",
      })
        .select("_id email firstName lastName stripeCustomerId subscription.status")
        .lean();

      const userMap = new Map(users.map((u) => [u.stripeCustomerId, u]));

      // 6. Batch fetch customers to get their default payment methods (fallback)
      // Uses throttled batching with retry logic to respect Stripe rate limits
      const customerPaymentMethodMap = await batchFetchCustomers(customerIds, 15, 200);

      // 7. Filter invoices based on all criteria
      // Note: invoice.status is already "open" from the list call above
      const eligibleInvoices = allInvoices.filter((invoice) => {
        // Check collection method
        if (invoice.collection_method !== "charge_automatically") {
          return false;
        }

        // Check amount remaining
        if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
          return false;
        }

        // Check database status first (to get customerId)
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) {
          return false;
        }

        const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
        if (!resolveInvoicePaymentMethodId(invoice, customerPaymentMethod)) {
          return false;
        }

        const user = userMap.get(customerId);
        if (!user || user.subscription?.status !== "past_due") {
          return false;
        }

        return true;
      });

      const results: Array<{
        invoiceId: string;
        customerId: string;
        userId?: string;
        userEmail?: string;
        status: "success" | "failed" | "skipped";
        error?: string;
        amount?: number;
        skipReason?: string;
      }> = [];

      let processed = 0;
      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      // 8. Process in batches
      const BATCH_SIZE = 15;
      const BATCH_DELAY = 500;

      for (let i = 0; i < eligibleInvoices.length; i += BATCH_SIZE) {
        const batch = eligibleInvoices.slice(i, i + BATCH_SIZE);

        const _batchResults = await Promise.allSettled(
          batch.map(async (invoice) => {
            const invoiceId = invoice.id;
            if (!invoiceId) return;
            
            const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
            if (!customerId) return;

            // Get user first (needed for email in results)
            const user = userMap.get(customerId);
            const userEmail = user?.email || "N/A";

            if (!user) {
              skipped++;
              results.push({
                invoiceId: invoiceId,
                customerId: customerId,
                userEmail: userEmail,
                status: "skipped",
                skipReason: "User not found or not past_due",
                amount: invoice.amount_remaining || 0,
              });
              return;
            }

            const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
            const paymentMethodId = resolveInvoicePaymentMethodId(invoice, customerPaymentMethod);

            if (!paymentMethodId) {
              skipped++;
              results.push({
                invoiceId: invoiceId,
                customerId: customerId,
                userId: user._id.toString(),
                userEmail: userEmail,
                status: "skipped",
                skipReason: "No payment method found on invoice or customer",
                amount: invoice.amount_remaining || 0,
              });
              return;
            }

            const row = await payOpenInvoiceAsPastDueAdmin({
              invoice,
              paymentMethodId,
              customerId,
              user: { _id: user._id, email: user.email },
              adminId,
            });

            processed++;
            if (row.status === "success") succeeded++;
            else if (row.status === "failed") failed++;
            else skipped++;

            results.push(row);
          })
        );

        // Delay between batches
        if (i + BATCH_SIZE < eligibleInvoices.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }

      // Release lock
      await ChargeJobLock.findByIdAndUpdate("charge-job-lock", {
        isLocked: false,
      });

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
      // Release lock on error
      await ChargeJobLock.findByIdAndUpdate("charge-job-lock", {
        isLocked: false,
      });

      console.error("Error processing charges:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to process charges",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in charge-past-due route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
