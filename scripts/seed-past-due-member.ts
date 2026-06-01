/**
 * Dev/QA Seed Script: Past-Due Member for Reanchor Recovery Testing
 *
 * Creates (or reuses) a user in a ready-to-recover `past_due` state so a
 * human can log in / open admin and exercise every recovery channel of the
 * "Past-Due Reanchor" feature without needing to wait 30+ days for a real
 * renewal to fail.
 *
 * Usage:
 *   npm run seed:past-due-member -- --email=<addr> [options]
 *   npm run seed:past-due-member:dry -- --email=<addr>   # validate + print plan only
 *
 * Options:
 *   --email=<addr>      REQUIRED. Email of the member to create or reuse.
 *   --password=<pw>     Login password to set (default: TestPass123!)
 *   --package=<id>      Membership package id (default: tradie-subscription)
 *   --dry-run           Validate the test key + --email, print the plan, create nothing, exit 0.
 *   --cleanup           Delete the seed member and its Stripe test objects.
 *
 * Safety:
 * - HARD refuses any STRIPE_SECRET_KEY not starting with `sk_test_`.
 * - Prints the MongoDB host it will connect to before writing anything.
 * - Tags every Stripe object it creates with metadata: { seed_past_due_reanchor: "1" }
 *   so cleanup can identify them later.
 * - --dry-run creates nothing and exits 0.
 * - DO NOT run this against production. The Stripe key guard is a hard stop.
 *
 * Env: .env.local must have STRIPE_SECRET_KEY (a TEST key) and MONGODB_URI.
 *
 * @module scripts/seed-past-due-member
 */

import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CLEANUP = args.includes("--cleanup");

function getArg(prefix: string): string | undefined {
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const EMAIL = getArg("--email=");
const PASSWORD = getArg("--password=") ?? "TestPass123!";
const PACKAGE_ID = getArg("--package=") ?? "tradie-subscription";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STRIPE_API_VERSION = "2025-08-27.basil" as const;
const TOKEN_GOOD = "tok_visa"; // always-succeeds
const TOKEN_DECLINE = "tok_chargeCustomerFail"; // attaches fine, fails on charge
const AEST_TZ = "Australia/Sydney";
const SEED_TAG = "1" as const;

/** Period end lives on items in the Basil API. */
function periodEndOf(sub: Stripe.Subscription): number | undefined {
  return sub.items?.data?.[0]?.current_period_end;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until the test clock reaches status "ready". */
async function pollClockReady(stripe: Stripe, clockId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === "ready") return;
    if (clock.status === "internal_failure") {
      throw new Error(`Test clock ${clockId} hit internal_failure`);
    }
    await sleep(2000);
  }
  throw new Error(`Test clock ${clockId} did not become ready after 120s`);
}

// ---------------------------------------------------------------------------
// --cleanup flow
// ---------------------------------------------------------------------------
async function runCleanup(stripe: Stripe): Promise<void> {
  if (!EMAIL) {
    console.error("--cleanup requires --email=<addr>");
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email: EMAIL.toLowerCase() });
  if (!user) {
    console.log(`No user found with email ${EMAIL} — nothing to clean up.`);
    process.exit(0);
  }

  const customerId = user.stripeCustomerId as string | undefined;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer) || !customer.deleted) {
        const cust = customer as Stripe.Customer;
        // If tagged as a seed customer, delete its test clock (cascades customer + sub)
        if (cust.metadata?.seed_past_due_reanchor === SEED_TAG) {
          const testClockId = cust.test_clock
            ? typeof cust.test_clock === "string"
              ? cust.test_clock
              : (cust.test_clock as Stripe.TestHelpers.TestClock).id
            : undefined;
          if (testClockId) {
            await stripe.testHelpers.testClocks.del(testClockId);
            console.log(`Deleted test clock ${testClockId} (cascades customer + sub).`);
          } else {
            await stripe.customers.del(customerId);
            console.log(`Deleted customer ${customerId}.`);
          }
        } else {
          console.warn(
            `Customer ${customerId} does not have seed_past_due_reanchor metadata — skipping Stripe deletion to avoid touching real objects.`
          );
        }
      }
    } catch (e) {
      console.warn(`Could not retrieve/delete customer ${customerId}:`, (e as Error).message);
    }
  }

  // Only delete the Mongo user if it looks like a seed account
  if (user.firstName === "QA" && user.lastName === "Reanchor") {
    await User.deleteOne({ _id: user._id });
    console.log(`Deleted QA user ${EMAIL} from MongoDB.`);
  } else {
    // Reset Stripe pointers only
    user.stripeCustomerId = undefined;
    user.stripeSubscriptionId = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any).subscription = {
      packageId: "",
      startDate: new Date(),
      isActive: false,
      autoRenew: false,
      status: "incomplete",
    };
    user.markModified("subscription");
    await user.save();
    console.log(`Reset subscription pointers for ${EMAIL} (non-QA user — preserved account).`);
  }

  console.log("\nCleanup complete.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main seed flow
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // --- Guard: email is required for all non-help invocations ---
  if (!EMAIL) {
    console.error("ERROR: --email=<addr> is required.");
    console.error("Usage: npm run seed:past-due-member -- --email=qa-test@example.com");
    process.exit(1);
  }

  // --- Guard: Stripe test key ---
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("ERROR: STRIPE_SECRET_KEY is not set in .env.local");
    process.exit(2);
  }
  if (!stripeKey.startsWith("sk_test_")) {
    console.error(
      `REFUSING TO RUN: STRIPE_SECRET_KEY does not start with sk_test_ ` +
        `(found prefix "${stripeKey.slice(0, 8)}…"). ` +
        `This script creates real Stripe test objects and must ONLY run with a TEST key.`
    );
    process.exit(2);
  }

  const mongoUri = process.env.MONGODB_URI ?? "(not set)";
  const mongoHost = mongoUri.replace(/\/\/[^@]+@/, "//***@").split("/").slice(0, 3).join("/");

  console.log("=== seed-past-due-member ===");
  console.log(`Email:      ${EMAIL}`);
  console.log(`Package:    ${PACKAGE_ID}`);
  console.log(`Password:   ${PASSWORD}`);
  console.log(`Mongo host: ${mongoHost}`);
  console.log(`Stripe key: ${stripeKey.slice(0, 12)}…  [TEST MODE confirmed]`);
  console.log();

  if (DRY_RUN) {
    console.log("Plan (--dry-run: creating nothing):");
    console.log("  1. Connect to MongoDB, find-or-create user by email.");
    console.log("  2. Create a Stripe Test Clock (frozen at now).");
    console.log("  3. Create a Stripe customer + tok_visa PM → active subscription.");
    console.log("  4. Write active subscription shape to User document.");
    console.log("  5. Swap default PM to tok_chargeCustomerFail.");
    console.log("  6. Advance test clock past current_period_end → renewal fails → past_due.");
    console.log("  7. Set pause_collection + stamp dunning_recovery on open invoice.");
    console.log("  8. Mirror past_due state to MongoDB (status, isActive, pastDueAt).");
    console.log("  9. Print QA summary.");
    console.log("\n--dry-run: validated test key and printed plan. Created nothing. Exiting 0.");
    process.exit(0);
  }

  // --- Connect DB ---
  await connectDB();
  console.log("Connected to MongoDB.");

  // --- Stripe client ---
  const stripe = new Stripe(stripeKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    maxNetworkRetries: 2,
  });

  // -------------------------------------------------------------------------
  // Step 1: Create ephemeral product + price (AUD $10 monthly, quick renewal)
  // -------------------------------------------------------------------------
  console.log("Creating ephemeral Stripe product and price…");
  const product = await stripe.products.create({
    name: "QA Seed — Past-Due Reanchor (safe to delete)",
    metadata: { seed_past_due_reanchor: SEED_TAG },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1000, // AUD $10.00
    currency: "aud",
    recurring: { interval: "month" },
    metadata: { seed_past_due_reanchor: SEED_TAG },
  });
  console.log(`  product: ${product.id}  price: ${price.id}`);

  // -------------------------------------------------------------------------
  // Step 2: Create a Stripe Test Clock frozen at now
  // -------------------------------------------------------------------------
  console.log("Creating Stripe Test Clock…");
  const nowUnix = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: nowUnix,
    name: `seed-past-due-reanchor / ${EMAIL}`,
  });
  console.log(`  test clock: ${clock.id}  frozen_time: ${new Date(nowUnix * 1000).toISOString()}`);

  // -------------------------------------------------------------------------
  // Step 3: Create a customer ON the test clock with tok_visa default PM
  // -------------------------------------------------------------------------
  console.log("Creating Stripe customer with tok_visa default PM…");
  const goodPm = await stripe.paymentMethods.create({ type: "card", card: { token: TOKEN_GOOD } });
  const customer = await stripe.customers.create({
    email: EMAIL,
    name: "QA Reanchor",
    payment_method: goodPm.id,
    invoice_settings: { default_payment_method: goodPm.id },
    test_clock: clock.id,
    metadata: { seed_past_due_reanchor: SEED_TAG, seed_email: EMAIL },
  });
  console.log(`  customer: ${customer.id}`);

  // -------------------------------------------------------------------------
  // Step 4: Create active subscription → first invoice paid
  // -------------------------------------------------------------------------
  console.log("Creating active subscription (payment_behavior: error_if_incomplete)…");
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
    metadata: { seed_past_due_reanchor: SEED_TAG, seed_email: EMAIL },
  });
  const firstInvoice = sub.latest_invoice as Stripe.Invoice;
  const periodEnd = periodEndOf(sub);
  if (!periodEnd) {
    throw new Error("No current_period_end on the created subscription — cannot advance clock.");
  }
  console.log(
    `  subscription: ${sub.id}  status: ${sub.status}` +
      `  period_end: ${new Date(periodEnd * 1000).toISOString()}`
  );
  console.log(`  first invoice: ${firstInvoice.id}  status: ${firstInvoice.status}`);

  // -------------------------------------------------------------------------
  // Step 5: Capture original anchor day (day-of-month of period_end in AEST)
  // -------------------------------------------------------------------------
  const periodEndDate = new Date(periodEnd * 1000);
  const originalAnchorDay = formatInTimeZone(periodEndDate, AEST_TZ, "d");
  console.log(`  original anchor day (AEST): ${originalAnchorDay}`);

  // -------------------------------------------------------------------------
  // Step 6: Find-or-create the Mongo User
  // -------------------------------------------------------------------------
  console.log(`\nFinding or creating MongoDB user: ${EMAIL}…`);
  let user = await User.findOne({ email: EMAIL.toLowerCase() });
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  if (!user) {
    // Create a new seed user
    console.log("  No existing user found — creating new QA seed user.");
    user = new User({
      firstName: "QA",
      lastName: "Reanchor",
      email: EMAIL.toLowerCase(),
      password: hashedPassword,
      mobile: "+61400000000",
      role: "user",
      profileSetupCompleted: true,
      isActive: true,
      isEmailVerified: true,
      isMobileVerified: true,
      savedPaymentMethods: [],
      accumulatedEntries: 0,
      entryWallet: 0,
      rewardsPoints: 0,
      oneTimePackages: [],
      cart: [],
      upsellPurchases: [],
      upsellStats: {
        totalShown: 0,
        totalAccepted: 0,
        totalDeclined: 0,
        totalDismissed: 0,
        conversionRate: 0,
        lastInteraction: null,
      },
      upsellHistory: [],
      miniDrawPackages: [],
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
      subscription: {
        packageId: PACKAGE_ID,
        status: "active",
        isActive: true,
        startDate: new Date(),
        endDate: periodEndDate,
        autoRenew: true,
      },
    });
    await user.save();
    console.log(`  Created user: ${user._id}`);
  } else {
    // Reuse existing user — warn and overwrite Stripe pointers
    console.warn(
      `  WARNING: Reusing existing user ${user._id}. Overwriting stripeCustomerId, ` +
        `stripeSubscriptionId, and subscription fields.`
    );
    user.password = hashedPassword;
    user.stripeCustomerId = customer.id;
    user.stripeSubscriptionId = sub.id;
    user.profileSetupCompleted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any).subscription = {
      packageId: PACKAGE_ID,
      status: "active",
      isActive: true,
      startDate: new Date(),
      endDate: periodEndDate,
      autoRenew: true,
    };
    user.markModified("subscription");
    await user.save();
    console.log(`  Updated existing user: ${user._id}`);
  }

  // -------------------------------------------------------------------------
  // Step 7: Swap default PM to tok_chargeCustomerFail so next renewal fails
  // -------------------------------------------------------------------------
  console.log("\nSwapping default PM to tok_chargeCustomerFail…");
  const declinePm = await stripe.paymentMethods.create({
    type: "card",
    card: { token: TOKEN_DECLINE },
  });
  await stripe.paymentMethods.attach(declinePm.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: declinePm.id },
  });
  console.log(`  decline PM: ${declinePm.id}`);

  // -------------------------------------------------------------------------
  // Step 8: Advance test clock past period_end → renewal charge fails → past_due
  // -------------------------------------------------------------------------
  const advanceTo = periodEnd + 3600; // 1 hour past period end
  console.log(
    `\nAdvancing test clock to ${new Date(advanceTo * 1000).toISOString()} ` +
      `(${Math.round((advanceTo - nowUnix) / 86400)} days ahead)…`
  );
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: advanceTo });
  console.log("  Polling until clock ready…");
  await pollClockReady(stripe, clock.id);
  console.log("  Clock ready.");

  // Retrieve the updated subscription to confirm past_due
  const pastDueSub = await stripe.subscriptions.retrieve(sub.id, { expand: ["items"] });
  console.log(`  subscription status after advance: ${pastDueSub.status}`);
  if (pastDueSub.status !== "past_due" && pastDueSub.status !== "unpaid") {
    console.warn(
      `  WARNING: Expected status past_due or unpaid but got '${pastDueSub.status}'. ` +
        `The open invoice may take a moment to process — continuing anyway.`
    );
  }

  // -------------------------------------------------------------------------
  // Step 9: Find the open subscription_cycle invoice
  // -------------------------------------------------------------------------
  console.log("\nFinding open subscription_cycle invoice…");
  const openInvoices = await stripe.invoices.list({
    customer: customer.id,
    status: "open",
    limit: 10,
  });
  const openCycleInvoice = openInvoices.data.find(
    (inv) => inv.billing_reason === "subscription_cycle"
  );
  if (!openCycleInvoice) {
    // Try without billing_reason filter — the invoice should still be open
    console.warn(
      "  No open subscription_cycle invoice found. Listing all open invoices as fallback:"
    );
    openInvoices.data.forEach((inv) =>
      console.warn(`    ${inv.id}  billing_reason=${inv.billing_reason}  status=${inv.status}`)
    );
    throw new Error(
      "Could not find the open renewal invoice after clock advance. " +
        "This usually means the clock did not advance far enough or Stripe is still processing."
    );
  }
  console.log(
    `  open invoice: ${openCycleInvoice.id}` +
      `  billing_reason: ${openCycleInvoice.billing_reason}` +
      `  attempt_count: ${openCycleInvoice.attempt_count}`
  );

  // -------------------------------------------------------------------------
  // Step 10: Mirror the app's failure handler — pause collection + stamp invoice
  // -------------------------------------------------------------------------
  console.log("\nApplying pause_collection on the Stripe subscription…");
  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "keep_as_draft" },
    metadata: { seed_past_due_reanchor: SEED_TAG },
  });

  console.log("Stamping dunning_recovery metadata on the open invoice…");
  const openInvoiceId = openCycleInvoice.id as string;
  await stripe.invoices.update(openInvoiceId, {
    metadata: {
      ...openCycleInvoice.metadata,
      dunning_recovery: "1",
      seed_past_due_reanchor: SEED_TAG,
    },
  });

  // -------------------------------------------------------------------------
  // Step 11: Mirror past_due state to MongoDB
  // -------------------------------------------------------------------------
  console.log("\nMirroring past_due state to MongoDB…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (user as any).subscription = {
    packageId: PACKAGE_ID,
    status: "past_due",
    isActive: false,
    startDate: user.subscription?.startDate ?? new Date(),
    endDate: periodEndDate,
    autoRenew: true,
    pastDueAt: new Date(),
    // clear lastReanchoredInvoiceId so the recovery flow is not blocked
    lastReanchoredInvoiceId: undefined,
  };
  user.markModified("subscription");
  await user.save();
  console.log("  MongoDB user saved with status=past_due, isActive=false, pastDueAt=now.");

  // -------------------------------------------------------------------------
  // Step 12: Print QA summary + checklist
  // -------------------------------------------------------------------------
  const clockFrozenAt = new Date(advanceTo * 1000).toISOString();

  console.log("\n");
  console.log("=".repeat(72));
  console.log("  QA SEED COMPLETE — PAST-DUE MEMBER READY FOR RECOVERY TESTING");
  console.log("=".repeat(72));
  console.log();
  console.log("LOGIN CREDENTIALS");
  console.log(`  Email:     ${EMAIL}`);
  console.log(`  Password:  ${PASSWORD}`);
  console.log(`  User _id:  ${user._id}`);
  console.log();
  console.log("STRIPE OBJECTS");
  console.log(`  Customer ID:          ${customer.id}`);
  console.log(`  Subscription ID:      ${sub.id}`);
  console.log(`  Open Invoice ID:      ${openInvoiceId}`);
  console.log(`  Test Clock ID:        ${clock.id}`);
  console.log(`  Clock frozen at:      ${clockFrozenAt}`);
  console.log(`  First invoice (paid): ${firstInvoice.id}`);
  console.log();
  console.log("BILLING CONTEXT");
  console.log(`  Original anchor day (AEST): ${originalAnchorDay}`);
  console.log(
    "  NOTE: The member lives in TEST-CLOCK time (~1 month ahead of today)."
  );
  console.log(
    "  Recovery dates (trial_end, endDate) will be relative to the clock's frozen time,"
  );
  console.log("  not wall-clock now. This is expected and correct.");
  console.log();
  console.log("PREREQUISITE");
  console.log(
    "  Run the Stripe webhook listener so invoice.payment_succeeded reaches the app:"
  );
  console.log(
    "    stripe listen --forward-to localhost:3000/api/stripe/webhook"
  );
  console.log();
  console.log("RECOVERY CHANNELS — QA CHECKLIST");
  console.log();
  console.log(
    "  After recovering via ANY channel, verify ALL of the following in the DB:"
  );
  console.log(
    "    [✓] User.subscription.endDate moved to the new anchor (clamped 25/26/27→24)"
  );
  console.log("    [✓] User.subscription.lastReanchoredInvoiceId set to the open invoice id");
  console.log("    [✓] A MembershipStatusHistory row with source: 'webhook_past_due_reanchor'");
  console.log("    [✓] Stripe subscription status = 'trialing' with new current_period_end");
  console.log("    [✓] No extra charge (only the recovery invoice was collected)");
  console.log("    [✓] Klaviyo next_renewal_date property updated");
  console.log();
  console.log("  Channel A — Admin: Charge Past-Due");
  console.log(`    POST /api/admin/charge-past-due  (user ${user._id})`);
  console.log();
  console.log("  Channel B — Admin: Force Charge");
  console.log(`    POST /api/admin/force-charge-past-due  (user ${user._id})`);
  console.log();
  console.log("  Channel C — User: renew-subscription retry (the channel the probe found was");
  console.log(
    "    broken — verify it now reanchors correctly after the past-due reanchor fix)"
  );
  console.log("    POST /api/subscription/renew-subscription");
  console.log();
  console.log("  Channel D — User: Pay-Now / pay-failed-invoice");
  console.log("    POST /api/invoice/pay-failed-invoice");
  console.log();
  console.log("  After each channel test, re-run the seed to get a fresh past_due state:");
  console.log(`    npm run seed:past-due-member -- --email=${EMAIL} --cleanup`);
  console.log(`    npm run seed:past-due-member -- --email=${EMAIL}`);
  console.log();
  console.log("CLEANUP");
  console.log(`  npm run seed:past-due-member -- --cleanup --email=${EMAIL}`);
  console.log();
  console.log("  The member is intentionally left in past_due state for QA.");
  console.log("  Do NOT auto-clean — run the cleanup command above when finished.");
  console.log("=".repeat(72));

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith("sk_test_")) {
  // Guard before even connecting to Stripe for the cleanup path
  if (!DRY_RUN && !CLEANUP) {
    // Will be caught again inside main(), but fail fast for clarity
  }
}

(async () => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("ERROR: STRIPE_SECRET_KEY is not set in .env.local");
      process.exit(2);
    }
    if (!stripeKey.startsWith("sk_test_")) {
      console.error(
        `REFUSING TO RUN: STRIPE_SECRET_KEY does not start with sk_test_ ` +
          `(found prefix "${stripeKey.slice(0, 8)}…"). TEST key required.`
      );
      process.exit(2);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      maxNetworkRetries: 2,
    });

    if (CLEANUP) {
      await runCleanup(stripe);
    } else {
      await main();
    }
  } catch (err) {
    console.error("\nSeed script failed:", err);
    process.exit(1);
  }
})();
