import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import MajorDraw from "@/models/MajorDraw";
import Order from "@/models/Order";

/**
 * Shop entry grant — the silent-failure guards.
 *
 * Runs against E2E_MONGODB_URI (the wipeable `toolsaustralia-e2e` database), NEVER
 * the dev database named by MONGODB_URI. This test writes real documents.
 *
 * WHAT THIS COVERS — the failure modes that produce no error at all:
 *
 *   1. `entriesBySource.shop` survives a write. Mongoose strict mode DROPS keys
 *      absent from the schema, silently, on save rather than on assignment — so
 *      the only assertion that catches it reads the value back from Mongo. This
 *      exact bug has shipped twice before on this sub-schema (see the comments in
 *      MajorDraw.ts on the cancellation-upsell and promo-link keys).
 *   2. `Order.products[].includedEntries` survives a write. Same failure mode, and
 *      it is the number the customer was promised at checkout.
 *   3. `entriesGranted` distinguishes absent from zero. If the field defaulted to
 *      0, a grant that never ran would be indistinguishable from an order worth no
 *      entries, and neither support nor the reconcile cron could tell them apart.
 *   4. The base-count arithmetic, including the multiplier and the ladder property
 *      that makes merch inheriting the one-time multiplier fair.
 *
 * WHAT THIS DOES NOT COVER, and why it matters that you know:
 *   - The end-to-end grant through processPaymentBenefits (needs a user, an active
 *     draw in a specific state, and a Stripe PaymentIntent).
 *   - Webhook replay idempotency and the already_processed retry path.
 *   - Refund reversal of a shop grant.
 *   These are the e2e suite's job; they are listed in the phase-3 plan, not done.
 */

const URI = process.env.E2E_MONGODB_URI;

/** Every key the MajorDraw sub-schema declares, all zeroed. */
function zeroedSources() {
  return {
    membership: 0,
    "one-time-package": 0,
    upsell: 0,
    "mini-draw": 0,
    referral: 0,
    "bonus-entry-promo": 0,
    "cancellation-upsell": 0,
    "promo-link": 0,
    streak: 0,
    shop: 0,
  };
}

/**
 * The production sum, duplicated here on purpose. finalizeShopOrder computes this
 * inline over a Mongoose document; reproducing the arithmetic keeps the assertion
 * honest about WHAT is being checked (the rule) rather than re-calling the code
 * under test and proving only that it equals itself.
 */
function baseEntriesFor(lines: { includedEntries?: number; quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + (l.includedEntries ?? 0) * l.quantity, 0);
}

async function run() {
  if (!URI) {
    console.error("✗ E2E_MONGODB_URI is not set. Refusing to run against MONGODB_URI (the dev database).");
    process.exit(1);
  }

  await mongoose.connect(URI);

  const drawIds: mongoose.Types.ObjectId[] = [];
  const orderIds: mongoose.Types.ObjectId[] = [];
  let failures = 0;

  const check = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  try {
    // ---------------------------------------------------------------- 1. draw
    const userId = new mongoose.Types.ObjectId();
    // `completed` rather than queued/active: this fixture only needs a document
    // that persists the sub-schema, and a live-status draw would drag in the
    // drawDate/activationDate/freezeEntriesAt conditional-required chain and,
    // worse, could be picked up as a real target draw by anything else pointed at
    // this database.
    const drawDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const draw = await MajorDraw.create({
      name: "Shop entry grant test draw",
      description: "Fixture for src/utils/payment/__tests__/shop-entry-grant.test.ts",
      status: "completed",
      drawDate,
      // Conditionally required whenever drawDate is set (MajorDraw.ts ~L148-152).
      freezeEntriesAt: new Date(drawDate.getTime() - 4 * 60 * 60 * 1000),
      entries: [
        {
          userId,
          totalEntries: 5,
          entriesBySource: { ...zeroedSources(), shop: 5 },
          firstAddedDate: new Date(),
          lastUpdatedDate: new Date(),
        },
      ],
      totalEntries: 5,
    });
    drawIds.push(draw._id as mongoose.Types.ObjectId);

    const rereadDraw = await MajorDraw.findById(draw._id).lean<{
      entries: { entriesBySource: Record<string, number>; totalEntries: number }[];
    } | null>();

    check("entriesBySource.shop survives the write (Mongoose strict mode)", () => {
      assert.ok(rereadDraw, "draw did not persist");
      assert.equal(
        rereadDraw!.entries[0].entriesBySource.shop,
        5,
        "the shop key was dropped on save — it is missing from the MajorDraw sub-schema"
      );
    });

    // CONTROL. Without this, "shop persisted" proves nothing — it would also pass
    // on a schema with strict mode off, where every key persists and the guard is
    // vacuous. Writing a key the sub-schema does NOT declare and watching it
    // disappear proves the drop mechanism is live, and therefore that the
    // assertion above is load-bearing rather than decorative.
    const controlDraw = await MajorDraw.create({
      name: "Shop entry grant control draw",
      description: "Control fixture — proves Mongoose strict mode drops undeclared keys",
      status: "completed",
      drawDate,
      freezeEntriesAt: new Date(drawDate.getTime() - 4 * 60 * 60 * 1000),
      entries: [
        {
          userId,
          totalEntries: 5,
          entriesBySource: { ...zeroedSources(), "not-a-real-source": 5 },
          firstAddedDate: new Date(),
          lastUpdatedDate: new Date(),
        },
      ],
      totalEntries: 5,
    });
    drawIds.push(controlDraw._id as mongoose.Types.ObjectId);

    const rereadControl = await MajorDraw.findById(controlDraw._id).lean<{
      entries: { entriesBySource: Record<string, number> }[];
    } | null>();

    check("CONTROL: an undeclared source key IS dropped, so the guard above is real", () => {
      assert.equal(
        rereadControl!.entries[0].entriesBySource["not-a-real-source"],
        undefined,
        "strict mode is not dropping unknown keys — the shop assertion above proves nothing"
      );
    });

    check("the shop bucket agrees with the row total", () => {
      const row = rereadDraw!.entries[0];
      const summed = Object.values(row.entriesBySource).reduce((a, b) => a + b, 0);
      assert.equal(summed, row.totalEntries, "breakdown does not reconcile with totalEntries");
    });

    // --------------------------------------------------------------- 2. order
    const order = await Order.create({
      orderNumber: `SHOP-TEST-${Date.now().toString(36).toUpperCase()}`,
      user: userId,
      products: [
        { product: new mongoose.Types.ObjectId(), name: "Staple Tee", sku: "TEE-M", includedEntries: 5, quantity: 2, price: 45.95 },
        { product: new mongoose.Types.ObjectId(), name: "Torquay Jacket", sku: "JKT-L", includedEntries: 8, quantity: 1, price: 79.95 },
      ],
      subtotal: 171.85,
      gstAmount: 15.62,
      shippingCost: 0,
      totalAmount: 171.85,
      status: "pending",
    });
    orderIds.push(order._id as mongoose.Types.ObjectId);

    const rereadOrder = await Order.findById(order._id).lean<{
      products: { includedEntries?: number; quantity: number }[];
      entriesGranted?: number;
    } | null>();

    check("Order line includedEntries survives the write", () => {
      assert.ok(rereadOrder, "order did not persist");
      assert.equal(rereadOrder!.products[0].includedEntries, 5, "tee entry count was dropped");
      assert.equal(rereadOrder!.products[1].includedEntries, 8, "jacket entry count was dropped");
    });

    check("entriesGranted is ABSENT before the grant runs, not 0", () => {
      assert.equal(
        rereadOrder!.entriesGranted,
        undefined,
        "a default of 0 would make a failed grant indistinguishable from a zero-entry order"
      );
    });

    // ---------------------------------------------------- 3. the arithmetic
    check("base entries sum across lines and quantities", () => {
      assert.equal(baseEntriesFor(rereadOrder!.products), 18, "5×2 + 8×1");
    });

    check("a line with no entry count contributes nothing, and does not throw", () => {
      assert.equal(baseEntriesFor([{ quantity: 3 }]), 0);
    });

    check("the multiplier scales the base count", () => {
      const base = baseEntriesFor(rereadOrder!.products);
      assert.equal(base * 1, 18, "no promo");
      assert.equal(base * 5, 90, "5x promo");
    });

    check("the kill switch survives any multiplier — 0 base grants 0 at 10x", () => {
      const base = baseEntriesFor([{ includedEntries: 0, quantity: 4 }]);
      assert.equal(base * 10, 0, "shipping dark must stay dark during a promo");
    });

    check("merch stays worse value per entry than the thinnest pack at every multiplier", () => {
      // The property that makes inheriting the one-time multiplier fair: both
      // sides scale together, so the ratio never moves and merch can never
      // overtake the packs during a promo.
      const apprentice = { price: 25, entries: 3 };
      const tee = { price: 45.95, entries: 5 };
      const jacket = { price: 79.95, entries: 8 };
      for (const m of [1, 2, 5, 10]) {
        const per = (p: { price: number; entries: number }) => p.price / (p.entries * m);
        assert.ok(
          per(apprentice) < per(tee) && per(tee) < per(jacket),
          `ladder inverted at ${m}x: pack ${per(apprentice)}, tee ${per(tee)}, jacket ${per(jacket)}`
        );
      }
    });
  } finally {
    if (drawIds.length) await MajorDraw.deleteMany({ _id: { $in: drawIds } });
    if (orderIds.length) await Order.deleteMany({ _id: { $in: orderIds } });
    await mongoose.disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll shop entry-grant guards passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
