#!/usr/bin/env npx tsx

/**
 * List MongoDB users in past_due state whose current Stripe subscription
 * has no chargeable invoice (no open + no matching draft). These are the
 * "stuck-paused" users who can't be settled by the existing tools and
 * need Force Charge.
 *
 * Usage:
 *   npx tsx scripts/find-stuck-paused-users.ts [--limit=N] [--include-orphans]
 *
 * --include-orphans flag also lists open invoices on the customer's expired
 * subscriptions (those need manual void in Stripe Dashboard).
 *
 * Output: CSV to stdout. Progress to stderr.
 */

import { config } from "dotenv";
import path from "path";
import type Stripe from "stripe";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "200", 10)) : 200;
const INCLUDE_ORPHANS = process.argv.includes("--include-orphans");

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set (.env.local).");
    process.exit(1);
  }

  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { pickForceChargeTarget } = await import("../src/server/admin/forceChargePastDuePolicy");
  const { getPackageById } = await import("../src/data/membershipPackages");

  await mongoose.connect(process.env.MONGODB_URI);

  console.error(`Searching past_due users (limit ${LIMIT})…`);
  const users = await User.find({
    stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
    "subscription.status": "past_due",
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .limit(LIMIT)
    .lean();

  console.error(`Found ${users.length} past_due users to inspect.`);
  console.log(
    "email,userId,stripeCustomerId,stripeSubscriptionId,packageId,expectedAmountCents,openCount,draftCount,verdict,orphans"
  );

  let stuck = 0;
  let chargeable = 0;
  let unknown = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (i % 10 === 0) {
      console.error(`  progress: ${i}/${users.length}`);
    }

    const subId = (u.stripeSubscriptionId as string) || "";
    const customerId = (u.stripeCustomerId as string) || "";
    const packageId = (u.subscription as { packageId?: string } | undefined)?.packageId || "";
    const pkg = packageId ? getPackageById(packageId) : undefined;
    const expectedAmount =
      pkg && typeof pkg.price === "number" ? Math.round(pkg.price * 100) : 0;

    let openCount = 0;
    let draftCount = 0;
    let verdict = "unknown";
    let orphansLabel = "";

    try {
      const [openList, draftList] = await Promise.all([
        stripe.invoices.list({ subscription: subId, status: "open", limit: 10 }),
        stripe.invoices.list({ subscription: subId, status: "draft", limit: 10 }),
      ]);
      openCount = openList.data.length;
      draftCount = draftList.data.length;
      const target = pickForceChargeTarget(openList.data, draftList.data, expectedAmount);
      if (target) {
        // A "stranded" open is chargeable only via recovery (void + finalize held draft), not directly.
        verdict = target.kind === "stranded" ? "recoverable_stranded" : `chargeable_${target.kind}`;
        chargeable++;
      } else {
        verdict = "stuck";
        stuck++;
      }

      if (INCLUDE_ORPHANS && customerId) {
        const customerInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "open",
          limit: 20,
        });
        const orphans = customerInvoices.data.filter((inv) => {
          // Stripe API v2+ uses parent.subscription_details.subscription; fall
          // back to the legacy top-level subscription field for older API versions.
          const invWithHints = inv as Stripe.Invoice & {
            subscription?: string | { id?: string } | null;
            parent?: { subscription_details?: { subscription?: string } | null } | null;
          };
          const invSub =
            invWithHints.parent?.subscription_details?.subscription ??
            (typeof invWithHints.subscription === "string"
              ? invWithHints.subscription
              : invWithHints.subscription?.id);
          return invSub !== subId;
        });
        if (orphans.length > 0) {
          orphansLabel = orphans.map((o) => o.id).join("|");
        }
      }
    } catch (err) {
      verdict = `error:${err instanceof Error ? err.message : String(err)}`;
      unknown++;
    }

    const csvRow = [
      u.email || "",
      String(u._id),
      customerId,
      subId,
      packageId,
      expectedAmount,
      openCount,
      draftCount,
      verdict,
      orphansLabel,
    ]
      .map((v) =>
        String(v).includes(",") || String(v).includes('"')
          ? `"${String(v).replace(/"/g, '""')}"`
          : String(v)
      )
      .join(",");
    console.log(csvRow);
  }

  console.error(
    `\nDone. ${chargeable} chargeable | ${stuck} stuck | ${unknown} errored | ${users.length} total`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
