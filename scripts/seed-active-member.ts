/**
 * Dev/QA Seed Script: Active Member with ZERO major-draw entries
 *
 * Creates (or reuses) a user with a real, ACTIVE Stripe subscription but NO
 * entries in the current major draw — the "just subscribed / renewal grant
 * hasn't landed yet" state — so you can see how the member dashboard renders an
 * active member whose entries are still 0 (incoming on the next successful grant).
 *
 * Simpler than seed-past-due-member: no test clock, no failing card, no advance.
 *
 * Usage:
 *   npm run seed:active-member -- --email=<addr> [--package=tradie-subscription]
 *   npm run seed:active-member:dry -- --email=<addr>          # validate + print plan only
 *   npm run seed:active-member -- --email=<addr> --cleanup     # delete the seed member + Stripe objects
 *
 * Safety:
 * - HARD refuses any STRIPE_SECRET_KEY not starting with `sk_test_`.
 * - Writes the DB state ATOMICALLY (`updateOne`, no optimistic-concurrency `__v`
 *   check) so a concurrent Stripe webhook can't VersionError the save — same
 *   lesson as seed-past-due-member (see docs/infrastructure/gotchas.md).
 * - Tags every Stripe object with metadata { seed_active_member: "1" } for cleanup.
 *
 * NOTE: it does NOT add MajorDraw entries — that's the whole point (0 entries). If
 * `stripe listen` is forwarding the seed's `invoice.payment_succeeded` to a running
 * app that grants entries, run with the listener STOPPED to keep the member at 0.
 *
 * Env: .env.local must have STRIPE_SECRET_KEY (a TEST key) and MONGODB_URI.
 *
 * @module scripts/seed-active-member
 */

import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User, { type IUser } from "@/models/User";

config({ path: path.resolve(process.cwd(), ".env.local") });

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

const STRIPE_API_VERSION = "2025-08-27.basil" as const;
const TOKEN_GOOD = "tok_visa"; // always-succeeds
const SEED_TAG = "1" as const;

/** Period end lives on items in the Basil API. */
function periodEndOf(sub: Stripe.Subscription): number | undefined {
  return sub.items?.data?.[0]?.current_period_end;
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
        if (cust.metadata?.seed_active_member === SEED_TAG) {
          await stripe.customers.del(customerId);
          console.log(`Deleted customer ${customerId} (cascades subscription).`);
        } else {
          console.warn(
            `Customer ${customerId} lacks seed_active_member metadata — skipping Stripe deletion to avoid touching real objects.`,
          );
        }
      }
    } catch (e) {
      console.warn(`Could not retrieve/delete customer ${customerId}:`, (e as Error).message);
    }
  }

  if (user.firstName === "QA" && user.lastName === "ActiveMember") {
    await User.deleteOne({ _id: user._id });
    console.log(`Deleted QA user ${EMAIL} from MongoDB.`);
  } else {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          subscription: { packageId: "", startDate: new Date(), isActive: false, autoRenew: false, status: "incomplete" },
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      },
    );
    console.log(`Reset subscription pointers for ${EMAIL} (non-QA user — preserved account).`);
  }

  console.log("\nCleanup complete.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main seed flow
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (!EMAIL) {
    console.error("ERROR: --email=<addr> is required.");
    console.error("Usage: npm run seed:active-member -- --email=active-test@example.com");
    process.exit(1);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("ERROR: STRIPE_SECRET_KEY is not set in .env.local");
    process.exit(2);
  }
  if (!stripeKey.startsWith("sk_test_")) {
    console.error(
      `REFUSING TO RUN: STRIPE_SECRET_KEY does not start with sk_test_ ` +
        `(found prefix "${stripeKey.slice(0, 8)}…"). TEST key required.`,
    );
    process.exit(2);
  }

  const mongoUri = process.env.MONGODB_URI ?? "(not set)";
  const mongoHost = mongoUri.replace(/\/\/[^@]+@/, "//***@").split("/").slice(0, 3).join("/");

  console.log("=== seed-active-member ===");
  console.log(`Email:      ${EMAIL}`);
  console.log(`Package:    ${PACKAGE_ID}`);
  console.log(`Password:   ${PASSWORD}`);
  console.log(`Mongo host: ${mongoHost}`);
  console.log(`Stripe key: ${stripeKey.slice(0, 12)}…  [TEST MODE confirmed]`);
  console.log();

  if (DRY_RUN) {
    console.log("Plan (--dry-run: creating nothing):");
    console.log("  1. Create an ephemeral Stripe product + price (AUD $20 / month).");
    console.log("  2. Create a customer + tok_visa PM → active subscription (first invoice paid).");
    console.log("  3. Find-or-create the user; write the ACTIVE subscription ATOMICALLY.");
    console.log("  4. Add NO major-draw entries (member stays at 0 — renewal grant not landed).");
    console.log("\n--dry-run: validated test key and printed plan. Created nothing. Exiting 0.");
    process.exit(0);
  }

  await connectDB();
  console.log("Connected to MongoDB.");

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION, typescript: true, maxNetworkRetries: 2 });

  console.log("Creating ephemeral Stripe product and price…");
  const product = await stripe.products.create({
    name: "QA Seed — Active Member (safe to delete)",
    metadata: { seed_active_member: SEED_TAG },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 2000, // AUD $20.00 (Tradie-ish)
    currency: "aud",
    recurring: { interval: "month" },
    metadata: { seed_active_member: SEED_TAG },
  });
  console.log(`  product: ${product.id}  price: ${price.id}`);

  console.log("Creating Stripe customer with tok_visa default PM…");
  const goodPm = await stripe.paymentMethods.create({ type: "card", card: { token: TOKEN_GOOD } });
  const customer = await stripe.customers.create({
    email: EMAIL,
    name: "QA ActiveMember",
    payment_method: goodPm.id,
    invoice_settings: { default_payment_method: goodPm.id },
    metadata: { seed_active_member: SEED_TAG, seed_email: EMAIL },
  });
  console.log(`  customer: ${customer.id}`);

  console.log("Creating active subscription (payment_behavior: error_if_incomplete)…");
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
    metadata: { seed_active_member: SEED_TAG, seed_email: EMAIL },
  });
  const firstInvoice = sub.latest_invoice as Stripe.Invoice;
  const periodEnd = periodEndOf(sub);
  const periodEndDate = periodEnd ? new Date(periodEnd * 1000) : undefined;
  console.log(`  subscription: ${sub.id}  status: ${sub.status}`);
  console.log(`  first invoice: ${firstInvoice.id}  status: ${firstInvoice.status}`);

  console.log(`\nFinding or creating MongoDB user: ${EMAIL}…`);
  let user = await User.findOne({ email: EMAIL.toLowerCase() });
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  if (!user) {
    console.log("  No existing user found — creating new QA seed user.");
    user = new User({
      firstName: "QA",
      lastName: "ActiveMember",
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
    console.warn(`  WARNING: Reusing existing user ${user._id}. Overwriting Stripe pointers + subscription.`);
  }

  // Write the ACTIVE state ATOMICALLY (updateOne, no __v race) — matches the
  // seed-past-due-member fix. Good card goes on savedPaymentMethods.
  const activeSubscription = {
    packageId: PACKAGE_ID,
    status: "active",
    isActive: true,
    startDate: user.subscription?.startDate ?? new Date(),
    endDate: periodEndDate,
    autoRenew: true,
  } as IUser["subscription"];
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password: hashedPassword,
        profileSetupCompleted: true,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: sub.id,
        subscription: activeSubscription,
        savedPaymentMethods: [{ paymentMethodId: goodPm.id, isDefault: true, createdAt: new Date() }],
      },
    },
  );
  console.log("  MongoDB user updated (atomic): status=active, isActive=true. NO major-draw entries added.");

  console.log("\n" + "=".repeat(72));
  console.log("  QA SEED COMPLETE — ACTIVE MEMBER, ZERO MAJOR-DRAW ENTRIES");
  console.log("=".repeat(72));
  console.log();
  console.log("LOGIN CREDENTIALS");
  console.log(`  Email:    ${EMAIL.toLowerCase()}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  User _id: ${user._id}`);
  console.log();
  console.log("STRIPE OBJECTS");
  console.log(`  Customer ID:     ${customer.id}`);
  console.log(`  Subscription ID: ${sub.id}  (${sub.status})`);
  console.log(`  First invoice:   ${firstInvoice.id}  (${firstInvoice.status})`);
  console.log();
  console.log("  The member is ACTIVE with 0 major-draw entries — the 'renewal grant not landed yet' state.");
  console.log("  If entries appear, a running `stripe listen` granted them — re-run with the listener STOPPED.");
  console.log(`  Cleanup: npm run seed:active-member -- --cleanup --email=${EMAIL}`);
  console.log("=".repeat(72));

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
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
          `(found prefix "${stripeKey.slice(0, 8)}…"). TEST key required.`,
      );
      process.exit(2);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION, typescript: true, maxNetworkRetries: 2 });

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
