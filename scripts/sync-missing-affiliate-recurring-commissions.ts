#!/usr/bin/env npx tsx

/**
 * Create missing membership-recurring AffiliateCommission rows by comparing Stripe
 * paid invoices (after the first paid invoice on each subscription) to existing DB records.
 *
 * Use after webhook fixes or for historical repair. Idempotent: skips invoices that already
 * have a membership-recurring row (same stripeInvoiceId).
 *
 * Usage:
 *   npx tsx scripts/sync-missing-affiliate-recurring-commissions.ts [--dry-run] [--live] [--limit=N]
 *
 * Default: --dry-run (no writes). Pass --live to insert commissions and update Affiliate totals.
 *
 * Env: MONGODB_URI, STRIPE_SECRET_KEY in .env.local
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "50", 10)) : 50;

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const AffiliateCommission = (await import("../src/models/AffiliateCommission")).default;
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { processMembershipRecurringCommission } = await import(
    "../src/utils/affiliate/commission-processing"
  );
  const { getPackageById } = await import("../src/data/membershipPackages");

  await connectDB();

  const firstMembership = await AffiliateCommission.find({
    commissionType: "membership-first",
  })
    .select("referredUserId affiliateId")
    .lean();

  const seen = new Set<string>();
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const row of firstMembership) {
    if (processed >= LIMIT) break;
    const uid = (row.referredUserId as { toString(): string }).toString();
    if (seen.has(uid)) continue;
    seen.add(uid);

    const user = await User.findById(uid).select("stripeSubscriptionId subscription.packageId email").lean();
    if (!user?.stripeSubscriptionId) {
      skipped++;
      continue;
    }

    const subId = user.stripeSubscriptionId;
    const invoices = await stripe.invoices.list({
      subscription: subId,
      limit: 100,
    });

    const paid = invoices.data
      .filter((inv) => inv.status === "paid" && (inv.amount_paid ?? 0) > 0)
      .sort((a, b) => a.created - b.created);

    // Index 0 = first paid invoice (membership-first / initial); later indices = renewals
    for (let i = 1; i < paid.length; i++) {
      if (processed >= LIMIT) break;
      const inv = paid[i];

      const existing = await AffiliateCommission.findOne({
        referredUserId: row.referredUserId,
        commissionType: "membership-recurring",
        stripeInvoiceId: inv.id,
      }).lean();
      if (existing) continue;

      const pkgId = (user as { subscription?: { packageId?: string } }).subscription?.packageId;
      const pkg = pkgId ? getPackageById(pkgId) : undefined;

      processed++;
      console.log(
        `[${LIVE ? "LIVE" : "DRY"}] Missing recurring for ${(user as { email?: string }).email} invoice ${inv.id} amount_paid=${inv.amount_paid}`
      );

      if (LIVE) {
        const rec = await processMembershipRecurringCommission({
          userId: uid,
          invoiceId: inv.id,
          subscriptionId: subId,
          purchaseAmount: inv.amount_paid ?? 0,
          packageId: pkgId,
          packageName: pkg?.name,
        });
        if (rec) created++;
      }
    }
  }

  console.log(`Done. processedInvoices=${processed} created=${created} skippedUsersNoSub=${skipped} dryRun=${!LIVE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
