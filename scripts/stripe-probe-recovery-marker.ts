/**
 * Stripe Probe (TEST MODE ONLY): verify the one link my reanchor fix depends on —
 * that `dunning_recovery` metadata stamped on a DRAFT invoice (via invoices.update)
 * SURVIVES finalizeInvoice, so the paid invoice carries the marker the reanchor gate reads.
 * Mirrors prepareRecoveredCycleInvoice's markDunningRecovery → finalize order.
 * Refuses any non-sk_test key; tears down all created objects.
 *
 * Usage: npx tsx scripts/stripe-probe-recovery-marker.ts
 */
import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
config({ path: path.resolve(process.cwd(), ".env.local") });

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error(`REFUSING: STRIPE_SECRET_KEY is not a test key (${key.slice(0, 8)}…). Test mode only.`);
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

async function main() {
  const created: { customer?: string } = {};
  let pass = true;
  const check = (id: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${id}  —  ${detail}`);
    if (!ok) pass = false;
  };
  try {
    const customer = await stripe.customers.create({ description: "probe-recovery-marker (delete me)" });
    created.customer = customer.id;

    // A DRAFT invoice with one line (mirrors a held cycle draft closely enough for metadata behaviour).
    await stripe.invoiceItems.create({ customer: customer.id, amount: 2000, currency: "aud" });
    const draft = await stripe.invoices.create({ customer: customer.id, auto_advance: false });
    check("D0.draft_created", draft.status === "draft", `invoice ${draft.id} status=${draft.status}`);

    // Step mirrors markDunningRecovery: merge existing metadata + dunning_recovery.
    const stamped = await stripe.invoices.update(draft.id!, {
      metadata: { ...(draft.metadata ?? {}), dunning_recovery: "1", probe: "yes" },
    });
    check("D1.stamped_on_draft", stamped.metadata?.dunning_recovery === "1", `draft metadata.dunning_recovery=${stamped.metadata?.dunning_recovery}`);

    // Finalize — the exact op prepareRecoveredCycleInvoice runs next. (A standalone invoice may
    // auto-collect to "paid"; a real paused cycle draft stays "open" for the caller to pay. Either
    // way it is finalized — what we're verifying is that the metadata survives the transition.)
    const finalized = await stripe.invoices.finalizeInvoice(draft.id!, { auto_advance: false });
    check("D2.finalized", finalized.status !== "draft", `finalized (no longer draft) status=${finalized.status}`);
    check(
      "D3.marker_SURVIVES_finalize",
      finalized.metadata?.dunning_recovery === "1",
      `finalized metadata.dunning_recovery=${finalized.metadata?.dunning_recovery} (expect "1")`
    );
    check(
      "D4.existing_metadata_preserved",
      finalized.metadata?.probe === "yes",
      `pre-existing metadata still present: probe=${finalized.metadata?.probe}`
    );

    // Void the finalized invoice to allow customer deletion cleanup.
    await stripe.invoices.voidInvoice(finalized.id!).catch(() => {});
  } finally {
    if (created.customer) await stripe.customers.del(created.customer).catch(() => {});
    console.log("\nCleaned up test objects.");
  }
  console.log(`\n=== RESULT: ${pass ? "ALL PASS — marker survives finalize; reanchor fix is sound" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
