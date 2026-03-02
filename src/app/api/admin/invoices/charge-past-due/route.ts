import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import ChargeJobLock from "@/models/ChargeJobLock";
import Stripe from "stripe";
import mongoose from "mongoose";

/**
 * Sanitize Stripe response to remove PCI-sensitive data
 */
function sanitizeStripeResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const obj = response as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (
      key.includes("card") ||
      key.includes("payment_method") ||
      key === "pan" ||
      key === "number" ||
      key === "cvc" ||
      key === "exp_month" ||
      key === "exp_year"
    ) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeStripeResponse(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Fetch customer with retry logic for rate limit errors
 * Follows Stripe best practices for handling rate limits
 */
async function fetchCustomerWithRetry(
  customerId: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Stripe.Customer | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }
      return customer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a rate limit error
      const isRateLimitError =
        (error as Stripe.errors.StripeError).code === "rate_limit" ||
        (error as Stripe.errors.StripeError).statusCode === 429 ||
        lastError.message.toLowerCase().includes("rate limit");

      // Don't retry non-rate-limit errors (invalid customer, etc.)
      if (!isRateLimitError) {
        return null;
      }

      // If we've exhausted retries, return null
      if (attempt >= maxRetries) {
        console.error(`Failed to fetch customer ${customerId} after ${maxRetries} retries:`, lastError.message);
        return null;
      }

      // Calculate delay with exponential backoff
      // Check for Retry-After header if available
      const stripeError = error as Stripe.errors.StripeError;
      let waitTime = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
      
      // If Stripe provides Retry-After, use it (in seconds, convert to ms)
      if (stripeError.headers?.["retry-after"]) {
        const retryAfterSeconds = parseInt(stripeError.headers["retry-after"], 10);
        if (!isNaN(retryAfterSeconds)) {
          waitTime = (retryAfterSeconds + 1) * 1000; // Add 1 second buffer
        }
      }

      // Cap maximum wait time at 10 seconds
      waitTime = Math.min(waitTime, 10000);

      console.warn(
        `⚠️ Rate limit error fetching customer ${customerId} - Retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return null;
}

/**
 * Batch fetch customers with throttling to respect Stripe rate limits
 * Processes in batches with delays between batches
 */
async function batchFetchCustomers(
  customerIds: string[],
  batchSize: number = 15,
  batchDelay: number = 200
): Promise<Map<string, string | null>> {
  const customerPaymentMethodMap = new Map<string, string | null>();
  const uniqueCustomerIds = [...new Set(customerIds)];

  // Process customers in batches
  for (let i = 0; i < uniqueCustomerIds.length; i += batchSize) {
    const batch = uniqueCustomerIds.slice(i, i + batchSize);

    // Fetch batch in parallel (but batches are sequential)
    const batchResults = await Promise.allSettled(
      batch.map(async (customerId) => {
        const customer = await fetchCustomerWithRetry(customerId);
        if (!customer) {
          return { customerId, paymentMethodId: null };
        }

        const customerWithSettings = customer as Stripe.Customer & {
          invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
        };

        const defaultPaymentMethod = customerWithSettings.invoice_settings?.default_payment_method;
        const paymentMethodId = defaultPaymentMethod
          ? typeof defaultPaymentMethod === "string"
            ? defaultPaymentMethod
            : defaultPaymentMethod.id
          : null;

        return { customerId, paymentMethodId };
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        customerPaymentMethodMap.set(result.value.customerId, result.value.paymentMethodId);
      } else {
        console.error(`Failed to fetch customer in batch:`, result.reason);
        // Don't set anything - will remain undefined, which is handled as null
      }
    }

    // Delay between batches to respect rate limits (except for last batch)
    if (i + batchSize < uniqueCustomerIds.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelay));
    }
  }

  return customerPaymentMethodMap;
}

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

      // Check payment method: invoice first, then customer's default as fallback
      const invoicePaymentMethod = invoice.default_payment_method
        ? (typeof invoice.default_payment_method === "string"
            ? invoice.default_payment_method
            : invoice.default_payment_method?.id)
        : null;
      
      const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
      const hasPaymentMethod = !!(invoicePaymentMethod || customerPaymentMethod);

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

        // Check payment method: invoice first, then customer's default as fallback
        const invoicePaymentMethod = invoice.default_payment_method
          ? (typeof invoice.default_payment_method === "string"
              ? invoice.default_payment_method
              : invoice.default_payment_method?.id)
          : null;
        
        const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
        const hasPaymentMethod = !!(invoicePaymentMethod || customerPaymentMethod);

        if (!hasPaymentMethod) {
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

            // Extract payment method: invoice first, then customer's default as fallback
            const invoicePaymentMethod = invoice.default_payment_method
              ? (typeof invoice.default_payment_method === "string"
                  ? invoice.default_payment_method
                  : invoice.default_payment_method?.id)
              : null;
            
            const customerPaymentMethod = customerPaymentMethodMap.get(customerId) || null;
            const paymentMethodId = invoicePaymentMethod || customerPaymentMethod;

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

            try {
              // Attempt charge with explicit payment method
              // Note: Idempotency is handled at database level (time-based) rather than Stripe level
              // This is safer for business retries and allows legitimate retries after card updates
              // off_session: true indicates this is an admin-initiated automatic charge without customer interaction
              const paidInvoice = await stripe.invoices.pay(invoiceId, {
                payment_method: paymentMethodId,
                off_session: true, // Admin-initiated automatic charge (customer not present)
              });

              // Check if already paid (race condition)
              if (paidInvoice.status === "paid") {
                processed++;
                succeeded++;
                results.push({
                  invoiceId: invoiceId,
                  customerId: customerId,
                  userId: user._id.toString(),
                  userEmail: userEmail,
                  status: "success",
                  amount: invoice.amount_remaining || 0,
                });

                // Log as success
                await InvoiceChargeLog.create({
                  invoiceId: invoiceId,
                  customerId: customerId,
                  userId: new mongoose.Types.ObjectId(user._id),
                  adminId: new mongoose.Types.ObjectId(adminId),
                  status: "success",
                  amount: invoice.amount_remaining || 0,
                  attemptedAt: new Date(),
                  result: sanitizeStripeResponse(paidInvoice),
                  nextPaymentAttempt: paidInvoice.next_payment_attempt
                    ? new Date(paidInvoice.next_payment_attempt * 1000)
                    : undefined,
                });
                return;
              }

              // Success
              processed++;
              succeeded++;
              results.push({
                invoiceId: invoiceId,
                customerId: customerId,
                userId: user._id.toString(),
                userEmail: userEmail,
                status: "success",
                amount: invoice.amount_remaining || 0,
              });

              // Log success
              await InvoiceChargeLog.create({
                invoiceId: invoiceId,
                customerId: customerId,
                userId: new mongoose.Types.ObjectId(user._id),
                adminId: new mongoose.Types.ObjectId(adminId),
                status: "success",
                amount: invoice.amount_remaining || 0,
                attemptedAt: new Date(),
                result: sanitizeStripeResponse(paidInvoice),
                nextPaymentAttempt: paidInvoice.next_payment_attempt
                  ? new Date(paidInvoice.next_payment_attempt * 1000)
                  : undefined,
              });
            } catch (error) {
              const stripeError = error as Stripe.errors.StripeError;

              // Check if already paid (race condition)
              if (
                stripeError.code === "resource_already_exists" ||
                stripeError.message?.includes("already paid") ||
                stripeError.message?.includes("already_paid")
              ) {
                processed++;
                skipped++;
                results.push({
                  invoiceId: invoiceId,
                  customerId: customerId,
                  userId: user._id.toString(),
                  userEmail: userEmail,
                  status: "skipped",
                  skipReason: "already_paid",
                  amount: invoice.amount_remaining || 0,
                });

                // Log as skipped
                await InvoiceChargeLog.create({
                  invoiceId: invoiceId,
                  customerId: customerId,
                  userId: new mongoose.Types.ObjectId(user._id),
                  adminId: new mongoose.Types.ObjectId(adminId),
                  status: "skipped",
                  amount: invoice.amount_remaining || 0,
                  attemptedAt: new Date(),
                  errorCode: stripeError.code,
                  errorMessage: "Invoice already paid",
                  result: sanitizeStripeResponse(stripeError),
                });
                return;
              }

              processed++;
              failed++;
              results.push({
                invoiceId: invoiceId,
                customerId: customerId,
                userId: user._id.toString(),
                userEmail: userEmail,
                status: "failed",
                error: stripeError.message || "Unknown error",
                amount: invoice.amount_remaining || 0,
              });

              // Log failure
              await InvoiceChargeLog.create({
                invoiceId: invoiceId,
                customerId: customerId,
                userId: new mongoose.Types.ObjectId(user._id),
                adminId: new mongoose.Types.ObjectId(adminId),
                status: "failed",
                errorCode: stripeError.code,
                errorMessage: stripeError.message,
                amount: invoice.amount_remaining || 0,
                attemptedAt: new Date(),
                result: sanitizeStripeResponse(stripeError),
              });
            }
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
