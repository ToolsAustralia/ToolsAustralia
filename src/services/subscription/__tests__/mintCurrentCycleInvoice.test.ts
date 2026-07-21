/**
 * mintCurrentCycleInvoice — deterministic unit test with injected fake Stripe/claim deps.
 * No network / no Mongo. Run: npm run test:mint-current-cycle
 * (Dynamic import after dotenv so `@/lib/stripe` doesn't throw at load when the key is unset.)
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { MintCurrentCycleDeps } from "../mintCurrentCycleInvoice";

type MintFn = (typeof import("../mintCurrentCycleInvoice"))["mintCurrentCycleInvoice"];
let mint: MintFn;

function subWithInvoice(inv: Partial<Stripe.Invoice> | null): Stripe.Subscription {
  return { id: "sub_1", latest_invoice: inv ? ({ id: "in_new", ...inv } as Stripe.Invoice) : null } as Stripe.Subscription;
}

function makeDeps(opts: {
  claim?: boolean;
  anchorThrows?: boolean;
  sub?: Stripe.Subscription;
  voidThrows?: boolean;
}) {
  const calls = { acquired: 0, released: 0, anchored: 0, voided: [] as string[] };
  const deps: MintCurrentCycleDeps = {
    acquireClaim: async () => { calls.acquired++; return opts.claim ?? true; },
    releaseClaim: async () => { calls.released++; },
    unpauseAndAnchorNow: async () => {
      calls.anchored++;
      if (opts.anchorThrows) throw new Error("anchor boom");
      return opts.sub ?? subWithInvoice({ status: "paid", amount_paid: 2000 });
    },
    voidInvoice: async (id) => { calls.voided.push(id); if (opts.voidThrows) throw new Error("void boom"); },
  };
  return { deps, calls };
}

async function testClaimHeldSkipsAndDoesNotAnchor() {
  const { deps, calls } = makeDeps({ claim: false });
  const res = await mint({ subscriptionId: "sub_1", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "claim_held");
  assert.equal(calls.anchored, 0, "must not anchor when the claim is held");
  assert.equal(calls.released, 0, "nothing to release when the claim was never acquired");
}

async function testHappyPathPaysAndVoidsOriginalAndReleases() {
  const { deps, calls } = makeDeps({ sub: subWithInvoice({ status: "paid", amount_paid: 2000 }) });
  const res = await mint({ subscriptionId: "sub_1", originalInvoiceId: "in_orig", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.invoiceId, "in_new");
    assert.equal(res.amountPaid, 2000);
  }
  assert.deepEqual(calls.voided, ["in_orig"], "voids the dead original after minting");
  assert.equal(calls.released, 1, "claim released");
}

async function testDoesNotVoidWhenOriginalEqualsMintedOrMissing() {
  const { deps, calls } = makeDeps({});
  await mint({ subscriptionId: "sub_1", originalInvoiceId: "in_new", claimedBy: "admin:1" }, deps);
  assert.equal(calls.voided.length, 0, "never void the very invoice we just minted");
  const { deps: d2, calls: c2 } = makeDeps({});
  await mint({ subscriptionId: "sub_1", claimedBy: "admin:1" }, d2);
  assert.equal(c2.voided.length, 0, "no original id => nothing to void");
}

async function testChargeFailedWhenMintedNotPaid() {
  const { deps } = makeDeps({ sub: subWithInvoice({ status: "open", amount_paid: 0 }) });
  const res = await mint({ subscriptionId: "sub_1", originalInvoiceId: "in_orig", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, false);
  if (!res.ok) { assert.equal(res.reason, "charge_failed"); assert.equal(res.invoiceId, "in_new"); }
}

async function testAnchorFailureReleasesClaim() {
  const { deps, calls } = makeDeps({ anchorThrows: true });
  const res = await mint({ subscriptionId: "sub_1", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "anchor_failed");
  assert.equal(calls.released, 1, "claim released even when anchor throws (finally)");
}

async function testNoMintedInvoice() {
  const { deps } = makeDeps({ sub: subWithInvoice(null) });
  const res = await mint({ subscriptionId: "sub_1", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "no_minted_invoice");
}

async function testVoidFailureIsNonFatal() {
  const { deps } = makeDeps({ voidThrows: true, sub: subWithInvoice({ status: "paid", amount_paid: 2000 }) });
  const res = await mint({ subscriptionId: "sub_1", originalInvoiceId: "in_orig", claimedBy: "admin:1" }, deps);
  assert.equal(res.ok, true, "a void failure must not fail a successful collection");
}

async function run() {
  ({ mintCurrentCycleInvoice: mint } = await import("../mintCurrentCycleInvoice"));
  await testClaimHeldSkipsAndDoesNotAnchor();
  await testHappyPathPaysAndVoidsOriginalAndReleases();
  await testDoesNotVoidWhenOriginalEqualsMintedOrMissing();
  await testChargeFailedWhenMintedNotPaid();
  await testAnchorFailureReleasesClaim();
  await testNoMintedInvoice();
  await testVoidFailureIsNonFatal();
  console.log("mintCurrentCycleInvoice tests passed");
}
run().catch((e) => { console.error(e); process.exit(1); });
