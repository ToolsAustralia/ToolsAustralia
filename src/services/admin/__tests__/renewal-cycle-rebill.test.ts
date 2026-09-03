/**
 * upsertRenewalCycleFromPaidInvoice — the renewal-cycle ledger write, with the past-due RE-BILL
 * override. Run: npm run test:renewal-cycle-rebill
 *
 * WHY THIS EXISTS
 * `mintCurrentCycleInvoice` collects a genuine renewal as Stripe `billing_reason:
 * "subscription_update"`. Until 2026-09-03 the webhook gated this write on the RAW reason, so a
 * re-bill counted as renewal REVENUE while writing no ledger row and granting no streak month —
 * 148 recoveries and 57 members' streaks went missing between 2026-07-21 and 2026-09-03. The
 * defect was invisible to `tsc` and to every existing test, because nothing asserted what this
 * function actually WRITES.
 *
 * So the assertions here are on the write payload, not the return value. The model static is
 * swapped for a recorder and the REAL function is driven — the same shape as
 * campaign-refund-double-reversal.test.ts. A pure re-model of the payload would only have tested
 * the author's assumption, which is exactly how the original defect survived review.
 *
 * No DB, no network: the only I/O this function performs is the stubbed static.
 */
import assert from "node:assert/strict";
import type Stripe from "stripe";
import mongoose from "mongoose";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import { upsertRenewalCycleFromPaidInvoice } from "@/services/admin/membershipAnalyticsPersistence";

type Write = { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } };

const USER_ID = new mongoose.Types.ObjectId("60f0000000000000000000b7");
/** 2026-09-03 01:00:00 UTC — the cycle boundary the invoice reports. */
const PERIOD_END = 1788397200;

function invoice(over: Partial<Stripe.Invoice> & { id?: string } = {}): Stripe.Invoice {
  return {
    id: "in_rebill_001",
    billing_reason: "subscription_update",
    period_end: PERIOD_END,
    amount_due: 2000,
    amount_paid: 2000,
    ...over,
  } as unknown as Stripe.Invoice;
}

/** Swap the model static for a recorder; returns the writes plus a restore fn. */
function recordWrites(preImageStatus: string | null) {
  const writes: Write[] = [];
  const original = MembershipRenewalCycle.findOneAndUpdate;
  (MembershipRenewalCycle as unknown as Record<string, unknown>).findOneAndUpdate = (
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
  ) => {
    writes.push({ filter, update });
    // findOneAndUpdate({new:false}) resolves to the PRE-image — null on a fresh insert.
    return Promise.resolve(preImageStatus === null ? null : { status: preImageStatus });
  };
  return { writes, restore: () => { (MembershipRenewalCycle as unknown as Record<string, unknown>).findOneAndUpdate = original; } };
}

async function run() {
  // ── 1. THE BUG: a re-bill WITH the override is written, and filed as a renewal ──────────────
  {
    const { writes, restore } = recordWrites(null);
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice(),
      userId: USER_ID,
      stripeSubscriptionId: "sub_1",
      billingReasonOverride: "subscription_cycle",
    });
    restore();
    assert.equal(writes.length, 1, "a classified re-bill MUST write a ledger row (this is the bug)");
    const set = writes[0].update.$set;
    // Stored as the renewal it is: every renewal query filters `billingReason: "subscription_cycle"`,
    // so storing the raw "subscription_update" would hide the row from the reports it exists for.
    assert.equal(set.billingReason, "subscription_cycle", "re-bill must be STORED as subscription_cycle");
    assert.equal(set.status, "succeeded");
    assert.equal(set.failedAt, null, "a paid cycle clears any prior failure timestamp");
    assert.equal(writes[0].filter.stripeInvoiceId, "in_rebill_001", "keyed by invoice id — idempotent per invoice");
    assert.equal(res.firstTimeSucceeded, true, "fresh insert → streak +1");
  }

  // ── 2. THE CRITICAL NEGATIVE: an upgrade must NEVER be filed as a renewal ───────────────────
  // A genuine tier change is also `subscription_update`. It reaches this function without the
  // override (the caller's isRebillPayment excludes upgrades). If it were written, a customer's
  // upgrade would count as a renewal in revenue, ROAS, and their streak.
  {
    const { writes, restore } = recordWrites(null);
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice({ id: "in_upgrade_001" }),
      userId: USER_ID,
    });
    restore();
    assert.equal(writes.length, 0, "subscription_update WITHOUT the override must write nothing");
    assert.equal(res.firstTimeSucceeded, false, "and must not grant a streak month");
  }

  // ── 3. Normal renewals are unchanged by the override's introduction ─────────────────────────
  {
    const { writes, restore } = recordWrites(null);
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice({ id: "in_cycle_001", billing_reason: "subscription_cycle" }),
      userId: USER_ID,
    });
    restore();
    assert.equal(writes.length, 1, "a plain subscription_cycle invoice still writes");
    assert.equal(writes[0].update.$set.billingReason, "subscription_cycle");
    assert.equal(res.firstTimeSucceeded, true);
  }

  // ── 4. Replay-proofness survives the change (the streak's only guard) ───────────────────────
  // The webhook increments the streak off `firstTimeSucceeded`, so a redelivered Stripe event
  // must return false or a member gains a phantom month per redelivery.
  {
    const { writes, restore } = recordWrites("succeeded");
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice(),
      userId: USER_ID,
      billingReasonOverride: "subscription_cycle",
    });
    restore();
    assert.equal(writes.length, 1, "the upsert still runs (it is idempotent)");
    assert.equal(res.firstTimeSucceeded, false, "REPLAY: an already-succeeded pre-image grants no second month");
  }

  // ── 5. A recovery from a prior failure DOES grant the month ─────────────────────────────────
  {
    const { restore } = recordWrites("failed");
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice(),
      userId: USER_ID,
      billingReasonOverride: "subscription_cycle",
    });
    restore();
    assert.equal(res.firstTimeSucceeded, true, "failed → succeeded is a first-time paid cycle");
  }

  // ── 6. A missing invoice id is refused before any write ─────────────────────────────────────
  {
    const { writes, restore } = recordWrites(null);
    const res = await upsertRenewalCycleFromPaidInvoice({
      invoice: invoice({ id: undefined }),
      userId: USER_ID,
      billingReasonOverride: "subscription_cycle",
    });
    restore();
    assert.equal(writes.length, 0, "no invoice id → no write (the row is keyed by it)");
    assert.equal(res.firstTimeSucceeded, false);
  }

  console.log("renewal-cycle re-bill ledger tests passed (6 cases)");
}

run().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
