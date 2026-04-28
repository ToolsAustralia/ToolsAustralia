/**
 * Backfill MembershipRenewalCycle and MembershipStatusHistory from existing data.
 *
 * Usage:
 *   npx tsx scripts/backfill-membership-analytics.ts           # live
 *   npx tsx scripts/backfill-membership-analytics.ts --dry-run
 *
 * Requires MONGODB_URI in `.env.local` or `.env` (same as Next.js app).
 */

import dotenv from "dotenv";
import path from "path";

// `import "dotenv/config"` only loads `.env`; Next.js uses `.env.local` for secrets.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import mongoose from "mongoose";

function extractInvoiceIdFromPaymentIntentId(paymentIntentId: string): string | null {
  if (!paymentIntentId.startsWith("invoice_")) return null;
  const raw = paymentIntentId.replace(/^invoice_/, "");
  return raw.split("_ts_")[0] || raw;
}

async function backfillRenewalCyclesFromPaymentEvents(dryRun: boolean): Promise<number> {
  const events = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": "subscription_cycle",
  })
    .select("_id userId paymentIntentId timestamp data")
    .lean();

  let n = 0;
  for (const ev of events) {
    const invoiceId = extractInvoiceIdFromPaymentIntentId(ev.paymentIntentId);
    if (!invoiceId) continue;

    const price = typeof ev.data?.price === "number" ? ev.data.price : 0;
    const amountPaidCents = Math.round(price * 100);
    const dueAt = ev.timestamp ? new Date(ev.timestamp) : new Date();

    if (!dryRun) {
      await MembershipRenewalCycle.findOneAndUpdate(
        { stripeInvoiceId: invoiceId },
        {
          $set: {
            userId: ev.userId,
            billingReason: "subscription_cycle",
            status: "succeeded",
            dueAt,
            amountDueCents: amountPaidCents,
            amountPaidCents,
            succeededAt: ev.timestamp ?? new Date(),
            confidence: "backfill",
          },
        },
        { upsert: true }
      );
    }
    n += 1;
  }
  return n;
}

async function backfillStatusHistoryFromUsers(dryRun: boolean): Promise<{ pastDue: number; cancelled: number }> {
  let pastDue = 0;
  let cancelled = 0;

  const pastDueUsers = await User.find({
    "subscription.pastDueAt": { $exists: true, $ne: null },
  })
    .select("_id subscription")
    .lean();

  for (const u of pastDueUsers) {
    const at = u.subscription?.pastDueAt;
    if (!at) continue;
    const dedupeKey = `backfill_pastdue_${u._id.toString()}_${at.getTime()}`;
    if (!dryRun) {
      try {
        await MembershipStatusHistory.create({
          userId: u._id,
          effectiveAt: at,
          membershipStatus: "past_due",
          actor: "system",
          source: "backfill_user_pastDueAt",
          dedupeKey,
          subscriptionPackageId:
            u.subscription?.packageId != null ? String(u.subscription.packageId) : undefined,
          pastDueAt: at,
          metadata: { backfill: true },
        });
      } catch (e: unknown) {
        const code = e && typeof e === "object" && "code" in e ? (e as { code: number }).code : undefined;
        if (code !== 11000) throw e;
      }
    }
    pastDue += 1;
  }

  const cancelUsers = await User.find({
    "subscription.cancelledAt": { $exists: true, $ne: null },
  })
    .select("_id subscription")
    .lean();

  for (const u of cancelUsers) {
    const at = u.subscription?.cancelledAt;
    if (!at) continue;
    const status =
      u.subscription?.status === "canceled" || u.subscription?.status === "cancelled"
        ? "canceled"
        : u.subscription?.autoRenew === false
          ? "scheduled_cancel"
          : "scheduled_cancel";
    const dedupeKey = `backfill_cancel_${u._id.toString()}_${at.getTime()}`;
    if (!dryRun) {
      try {
        await MembershipStatusHistory.create({
          userId: u._id,
          effectiveAt: at,
          membershipStatus: status,
          actor: "system",
          source: "backfill_user_cancelledAt",
          dedupeKey,
          subscriptionPackageId:
            u.subscription?.packageId != null ? String(u.subscription.packageId) : undefined,
          autoRenew: u.subscription?.autoRenew,
          endDate: u.subscription?.endDate ?? undefined,
          cancelledAt: at,
          metadata: { backfill: true },
        });
      } catch (e: unknown) {
        const code = e && typeof e === "object" && "code" in e ? (e as { code: number }).code : undefined;
        if (code !== 11000) throw e;
      }
    }
    cancelled += 1;
  }

  return { pastDue, cancelled };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — no writes" : "LIVE — writing to MongoDB");
  await connectDB();

  const renewalRows = await backfillRenewalCyclesFromPaymentEvents(dryRun);
  const hist = await backfillStatusHistoryFromUsers(dryRun);

  console.log("Backfill complete:", {
    renewalCyclesFromPaymentEvents: renewalRows,
    statusHistoryPastDue: hist.pastDue,
    statusHistoryCancelled: hist.cancelled,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
