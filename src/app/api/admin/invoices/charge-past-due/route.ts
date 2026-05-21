import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import ChargeJobLock from "@/models/ChargeJobLock";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import Stripe from "stripe";
import mongoose from "mongoose";
import {
  getCustomerDefaultPaymentMethodFromInvoice,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
  selectCurrentSubscriptionChargeable,
} from "@/server/admin/chargePastDueShared";
import ChargeJobRun from "@/models/ChargeJobRun";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  type ChargeLogRowForAggregation,
} from "@/server/admin/charge-past-due-totals";
import { previewChargePastDueInvoices } from "@/services/admin/previewChargePastDueInvoices";

type PastDueUserLean = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscription?: { status?: string | null };
};

/**
 * GET /api/admin/invoices/charge-past-due
 * Preview eligible invoices/users that will be charged (no actual charging)
 */
export async function GET(_request: NextRequest) {
  try {
    const _guard = await requirePermission("users.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();
    const preview = await previewChargePastDueInvoices();

    return NextResponse.json({
      success: true,
      preview,
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
    const guard = await requirePermission("users.charge");
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    await connectDB();

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

    // Orphan sweep: any prior ChargeJobRun stuck in "running" past the lock window
    // was almost certainly killed by a process crash. Mark them aborted so the
    // history view doesn't show indefinite "running" rows.
    await ChargeJobRun.updateMany(
      {
        status: "running",
        startedAt: { $lt: new Date(Date.now() - ORPHAN_RUN_THRESHOLD_MS) },
      },
      {
        $set: {
          status: "aborted",
          finishedAt: new Date(),
          error: "Aborted by orphan sweep — exceeded lock window without finalize",
        },
      }
    );

    try {
      // 4. Fetch eligible invoices from Stripe with pagination
      // Note: Stripe invoices don't have "past_due" status - that's a subscription status
      // We fetch "open" invoices and filter by database subscription status.
      // `expand: ['data.customer']` is mandatory here: it must mirror the GET
      // preview's expansion so preview-vs-charge eligibility cannot diverge,
      // and it removes the N+1 customer fetch that pushed POST over the
      // Vercel function timeout for large past-due cohorts.
      const allInvoices: Stripe.Invoice[] = [];
      let hasMore = true;
      let startingAfter: string | undefined = undefined;

      while (hasMore) {
        const invoiceResponse = await stripe.invoices.list({
          status: "open",
          collection_method: "charge_automatically",
          limit: 100,
          starting_after: startingAfter,
          expand: ["data.customer"],
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
        .select("_id email firstName lastName stripeCustomerId stripeSubscriptionId subscription.status")
        .lean<PastDueUserLean[]>();

      const userMap = new Map(users.map((u) => [u.stripeCustomerId, u]));

      // 6. Filter invoices based on all criteria.
      // Note: invoice.status is already "open" from the list call above.
      // Customer default payment methods come off the expanded `invoice.customer`
      // — no separate `customers.retrieve` round-trip needed.
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

        const customerDefaultPm = getCustomerDefaultPaymentMethodFromInvoice(invoice);
        if (!resolveInvoicePaymentMethodId(invoice, customerDefaultPm)) {
          return false;
        }

        const user = userMap.get(customerId);
        if (!user || user.subscription?.status !== "past_due") {
          return false;
        }

        return true;
      });

      // Scope each customer to the invoice attached to their current subscription only.
      const invoicesByCustomer = new Map<string, Stripe.Invoice[]>();
      for (const inv of eligibleInvoices) {
        const cid = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!cid) continue;
        if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, []);
        invoicesByCustomer.get(cid)!.push(inv);
      }

      const eligibleByUserSub: Stripe.Invoice[] = [];
      const skippedDuplicates: Array<{ invoice: Stripe.Invoice; customerId: string; user: PastDueUserLean }> = [];

      for (const [cid, custInvoices] of invoicesByCustomer) {
        const u = userMap.get(cid);
        if (!u) continue;
        const userSubId = u.stripeSubscriptionId;
        const { target, skipped: dups } = selectCurrentSubscriptionChargeable(custInvoices, userSubId);
        if (target) eligibleByUserSub.push(target);
        for (const d of dups) skippedDuplicates.push({ invoice: d, customerId: cid, user: u });
      }

      // Insert the run record — status="running" until finalize block runs.
      // Captures eligible count even if no invoices end up attempted.
      const chargeRun = await ChargeJobRun.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        startedAt: new Date(),
        status: "running",
        totals: { eligibleCount: eligibleInvoices.length },
      });
      const chargeRunId = chargeRun._id as mongoose.Types.ObjectId;

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

      try {
        for (let i = 0; i < eligibleByUserSub.length; i += BATCH_SIZE) {
          const batch = eligibleByUserSub.slice(i, i + BATCH_SIZE);

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

              const customerDefaultPm = getCustomerDefaultPaymentMethodFromInvoice(invoice);
              const paymentMethodId = resolveInvoicePaymentMethodId(invoice, customerDefaultPm);

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
                chargeRunId,
              });

              processed++;
              if (row.status === "success") succeeded++;
              else if (row.status === "failed") failed++;
              else skipped++;

              results.push(row);
            })
          );

          // Delay between batches
          if (i + BATCH_SIZE < eligibleByUserSub.length) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
          }
        }

        // Log skipped duplicates so audit stays honest about what we saw vs charged.
        for (const { invoice, customerId: cid, user: u } of skippedDuplicates) {
          if (!invoice.id) continue;
          skipped++;
          try {
            await InvoiceChargeLog.create({
              invoiceId: invoice.id,
              customerId: cid,
              userId: new mongoose.Types.ObjectId(String(u._id)),
              adminId: new mongoose.Types.ObjectId(adminId),
              status: "skipped",
              amount: invoice.amount_remaining || 0,
              attemptedAt: new Date(),
              errorMessage: "Skipped: duplicate or stale cycle invoice not on current subscription",
              chargeRunId,
            });
          } catch (logErr) {
            console.error("[charge-past-due] Failed to write InvoiceChargeLog for skipped duplicate:", logErr);
          }
          results.push({
            invoiceId: invoice.id,
            customerId: cid,
            userId: String(u._id),
            userEmail: u.email || "N/A",
            status: "skipped",
            skipReason: "duplicate_or_stale_cycle_invoice",
            amount: invoice.amount_remaining || 0,
          });
        }

        // Aggregate authoritative totals from the in-memory `results` array.
        const aggregationRows: ChargeLogRowForAggregation[] = results.map((r) => ({
          status: r.status,
          amount: r.amount ?? 0,
          skipReason: r.skipReason,
        }));
        const finalTotals = aggregateRunTotals(
          aggregationRows,
          eligibleInvoices.length
        );

        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "completed",
              totals: finalTotals,
            },
          }
        );
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        await ChargeJobRun.updateOne(
          { _id: chargeRunId },
          {
            $set: {
              finishedAt: new Date(),
              status: "failed",
              error: message,
            },
          }
        );
        throw runError;
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
