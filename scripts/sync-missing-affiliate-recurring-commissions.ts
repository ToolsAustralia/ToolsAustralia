#!/usr/bin/env npx tsx

/**
 * Create missing membership-recurring AffiliateCommission rows by comparing Stripe
 * paid invoices (after the first paid invoice on each subscription) to existing DB records.
 *
 * Use after webhook fixes or for historical repair. Idempotent: skips invoices that already
 * have a membership-recurring row (same stripeInvoiceId).
 *
 * Usage:
 *   npx tsx scripts/sync-missing-affiliate-recurring-commissions.ts [--dry-run] [--live] [--limit=N] [--no-limit]
 *   [--email=user@example.com] [--userId=MONGO_OBJECT_ID]
 *
 * Default: --dry-run (no writes). Pass --live to insert commissions and update Affiliate totals.
 *
 * --limit counts **missing recurring invoice slots** processed (not users). Once it hits N, the script
 * stops — users whose membership-first row appears later in the cursor may never run. Use --email or
 * --userId to repair a specific referred customer, or raise --limit and re-run until no work remains.
 *
 * --no-limit processes every referred user with a membership-first row (full backfill). Prefer a dry
 * run first: `... --no-limit` then `... --live --no-limit`.
 *
 * --repair-earned-at (with --live) sets `earnedAt` on existing membership-recurring rows from Stripe
 * invoice paid_at (fixes rows that were inserted earlier with “today” as the date).
 *
 * Env: MONGODB_URI, STRIPE_SECRET_KEY in .env.local
 */

import { config } from "dotenv";
import path from "path";
import type Stripe from "stripe";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");
const NO_LIMIT = process.argv.includes("--no-limit");
const REPAIR_EARNED_AT = process.argv.includes("--repair-earned-at");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = NO_LIMIT
  ? Number.MAX_SAFE_INTEGER
  : LIMIT_ARG
    ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "50", 10))
    : 50;
const EMAIL_ARG = process.argv.find((a) => a.startsWith("--email="));
const USER_ID_ARG = process.argv.find((a) => a.startsWith("--userId="));
const FILTER_EMAIL = EMAIL_ARG ? EMAIL_ARG.split("=").slice(1).join("=").trim().toLowerCase() : undefined;
const FILTER_USER_ID = USER_ID_ARG ? USER_ID_ARG.split("=").slice(1).join("=").trim() : undefined;

/**
 * When MongoDB `stripeSubscriptionId` is stale, paid invoices for renewals live on another sub.
 * Pick the customer subscription with the most paid invoices (amount_paid > 0).
 */
async function resolveSubscriptionIdForBackfill(
  stripe: Stripe,
  user: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    email?: string;
  },
  listPaid: (subId: string) => Promise<Stripe.Invoice[]>
): Promise<{ subscriptionId: string; source: "stored" | "customer_invoices" } | null> {
  const stored = user.stripeSubscriptionId?.trim();
  let paidStoredLen = 0;
  if (stored) {
    const paidStored = await listPaid(stored);
    paidStoredLen = paidStored.length;
    if (paidStoredLen >= 2) {
      return { subscriptionId: stored, source: "stored" };
    }
  }

  const cid = user.stripeCustomerId?.trim();
  if (!cid) {
    return stored ? { subscriptionId: stored, source: "stored" } : null;
  }

  const counts = new Map<string, number>();
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.invoices.list({
      customer: cid,
      status: "paid",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const inv of page.data) {
      if ((inv.amount_paid ?? 0) <= 0) continue;
      const invSub = (inv as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
      const sid =
        typeof invSub === "string"
          ? invSub
          : invSub && typeof invSub === "object" && "id" in invSub
            ? invSub.id
            : undefined;
      if (!sid) continue;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  let bestSub: string | undefined;
  let bestCount = 0;
  for (const [sid, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestSub = sid;
    }
  }

  if (bestSub && bestCount >= 2 && bestCount > paidStoredLen) {
    console.log(
      `[backfill] Using subscription ${bestSub} (${bestCount} paid invoices on customer) for ${user.email ?? cid}` +
        (stored && stored !== bestSub ? ` — stored id ${stored} had ${paidStoredLen} paid invoice(s)` : "")
    );
    return { subscriptionId: bestSub, source: "customer_invoices" };
  }

  if (stored) {
    return { subscriptionId: stored, source: "stored" };
  }
  return null;
}

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
  const { listAllPaidInvoicesForSubscription, paidAtDateFromStripeInvoice } = await import(
    "../src/utils/affiliate/affiliate-recurring-invoice"
  );
  const { processMembershipRecurringCommission } = await import(
    "../src/utils/affiliate/commission-processing"
  );
  const { stripeInvoiceIdLookupVariants } = await import("../src/utils/affiliate/affiliate-attribution");
  const { getPackageById } = await import("../src/data/membershipPackages");

  await connectDB();

  let firstMembership = await AffiliateCommission.find({
    commissionType: "membership-first",
  })
    .select("referredUserId affiliateId")
    .lean();

  if (FILTER_USER_ID) {
    firstMembership = firstMembership.filter(
      (r) => (r.referredUserId as { toString(): string }).toString() === FILTER_USER_ID
    );
    if (firstMembership.length === 0) {
      console.error(`No membership-first AffiliateCommission row for userId ${FILTER_USER_ID}`);
      process.exit(1);
    }
  } else if (FILTER_EMAIL) {
    const u = await User.findOne({ email: new RegExp(`^${FILTER_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
      .select("_id")
      .lean();
    if (!u) {
      console.error(`No user for email ${FILTER_EMAIL}`);
      process.exit(1);
    }
    const uid = u._id.toString();
    firstMembership = firstMembership.filter((r) => (r.referredUserId as { toString(): string }).toString() === uid);
    if (firstMembership.length === 0) {
      console.error(`No membership-first AffiliateCommission row for ${FILTER_EMAIL}`);
      process.exit(1);
    }
  }

  const seen = new Set<string>();
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let failedNull = 0;
  let repairedEarnedAt = 0;

  for (const row of firstMembership) {
    if (processed >= LIMIT) break;
    const uid = (row.referredUserId as { toString(): string }).toString();
    if (seen.has(uid)) continue;
    seen.add(uid);

    const user = await User.findById(uid)
      .select("stripeSubscriptionId stripeCustomerId subscription.packageId email")
      .lean();
    if (!user?.stripeSubscriptionId && !user?.stripeCustomerId) {
      skipped++;
      continue;
    }

    const resolved = await resolveSubscriptionIdForBackfill(
      stripe,
      user as {
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        email?: string;
      },
      (sid) => listAllPaidInvoicesForSubscription(stripe, sid)
    );
    if (!resolved) {
      skipped++;
      continue;
    }

    const subId = resolved.subscriptionId;
    const paid = await listAllPaidInvoicesForSubscription(stripe, subId);

    // Index 0 = first paid invoice (membership-first / initial); later indices = renewals
    for (let i = 1; i < paid.length; i++) {
      if (processed >= LIMIT) break;
      const inv = paid[i];
      if (!inv.id) {
        console.warn(`Skipping invoice without id (created=${inv.created})`);
        continue;
      }
      const invoiceId = inv.id;

      const invoiceVariants = stripeInvoiceIdLookupVariants(invoiceId);
      const existing = await AffiliateCommission.findOne({
        referredUserId: row.referredUserId,
        commissionType: "membership-recurring",
        stripeInvoiceId: { $in: invoiceVariants },
      }).lean();
      if (existing) {
        if (REPAIR_EARNED_AT && LIVE && existing._id) {
          const correctEarnedAt = paidAtDateFromStripeInvoice(inv);
          const cur = existing.earnedAt ? new Date(existing.earnedAt as Date) : null;
          if (!cur || Math.abs(cur.getTime() - correctEarnedAt.getTime()) > 60_000) {
            await AffiliateCommission.updateOne({ _id: existing._id }, { $set: { earnedAt: correctEarnedAt } });
            repairedEarnedAt++;
            console.log(
              `[LIVE] repaired earnedAt for ${(user as { email?: string }).email} invoice ${invoiceId} → ${correctEarnedAt.toISOString()}`
            );
          }
        }
        continue;
      }

      const pkgId = (user as { subscription?: { packageId?: string } }).subscription?.packageId;
      const pkg = pkgId ? getPackageById(pkgId) : undefined;

      processed++;
      console.log(
        `[${LIVE ? "LIVE" : "DRY"}] Missing recurring for ${(user as { email?: string }).email} invoice ${invoiceId} amount_paid=${inv.amount_paid}`
      );

      if (LIVE) {
        const rec = await processMembershipRecurringCommission({
          userId: uid,
          invoiceId,
          subscriptionId: subId,
          purchaseAmount: inv.amount_paid ?? 0,
          packageId: pkgId,
          packageName: pkg?.name,
          earnedAt: paidAtDateFromStripeInvoice(inv),
        });
        if (rec) {
          created++;
        } else {
          failedNull++;
          console.error(
            `[LIVE] processMembershipRecurringCommission returned null for ${(user as { email?: string }).email} invoice ${invoiceId}. Scroll up for a line starting with [AffiliateCommission] skip recurring: — that is the real reason (not three separate errors).`
          );
        }
      }
    }
  }

  console.log(
    `Done. processedInvoices=${processed} created=${created} failedNull=${failedNull} repairedEarnedAt=${repairedEarnedAt} skippedUsersNoSub=${skipped} dryRun=${!LIVE} limit=${NO_LIMIT ? "none" : LIMIT}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
