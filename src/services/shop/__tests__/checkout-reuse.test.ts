import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import Order, { type IOrder } from "@/models/Order";
import Product from "@/models/Product";
import { ShopOrderService } from "@/services/shop/ShopOrderService";

/**
 * Checkout order reuse — the duplicate-order guard.
 *
 * Runs against E2E_MONGODB_URI (the wipeable `toolsaustralia-e2e` database), NEVER
 * the dev database named by MONGODB_URI. This test writes real documents.
 *
 * WHAT BROKE, AND WHY IT NEEDED A TEST
 *
 * `POST /api/shop/checkout` called `createPendingOrder()` on every request and then
 * created a PaymentIntent keyed `shop_order_${order._id}` — an idempotency key derived
 * from an order minted three lines earlier in the same request, so it was unique per
 * request by construction. The checkout client holds `clientSecret` in React state
 * only, so a refresh at the card step dropped it, re-enabled the address form, and the
 * only action the UI offered was the one that duplicated the order. The product owner
 * reproduced exactly that: two orders, 01:14 and 01:16, one purchase.
 *
 * It was never only an analytics problem. `markPaid` gates on `{ _id, status:
 * "pending" }` — PER ORDER — so two orders carrying two intents that both confirmed
 * would each fulfil: stock decremented twice, entries granted twice.
 *
 * WHAT IS ASSERTED HERE
 *   1. The same cart twice yields ONE order row, and the same order id back.
 *   2. A re-submit with an EDITED ADDRESS still reuses, and the address is updated —
 *      shipping is flat and address-independent, so the total (and therefore any
 *      existing PaymentIntent) stays valid, and the customer who refreshed to fix a
 *      typo should not open a second order.
 *   3. A CHANGED CART does not reuse: it retires the old pending order to `cancelled`
 *      (so it stops counting) and creates a new one.
 *   4. A pending order older than the abandonment window is not reused.
 *   5. `abandonPendingOrder` cannot clobber an order the webhook already moved on —
 *      the `status: "pending"` filter is the race guard, and this asserts it by
 *      trying to abandon a `processing` order.
 *
 * NOT COVERED (needs Stripe): PaymentIntent retrieve/reuse and the amount+currency
 * validity check in `startShopCheckout`. Those are asserted by the e2e purchase run.
 */

const URI = process.env.E2E_MONGODB_URI;

const TAG = "REUSETEST";
let failures = 0;

const test = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

async function main() {
  if (!URI) {
    console.error("E2E_MONGODB_URI is not set — refusing to run against any other database.");
    process.exit(1);
  }
  if (!/e2e/i.test(URI)) {
    console.error("E2E_MONGODB_URI does not name an e2e database — refusing to run.");
    process.exit(1);
  }

  await mongoose.connect(URI);
  console.log(`connected to ${mongoose.connection.name}\n`);

  const userId = new mongoose.Types.ObjectId();

  const cleanup = async () => {
    await Order.deleteMany({ user: userId });
    await Product.deleteMany({ name: { $regex: `^${TAG}` } });
  };
  await cleanup();

  const [tee, hoodie] = await Product.create([
    {
      name: `${TAG} Tee`,
      description: "fixture",
      price: 39.95,
      images: ["/images/SampleProducts/kincrome1.jpg"],
      category: "apparel",
      brand: "Tools Australia",
      stock: 0,
      trackInventory: false,
      isActive: true,
    },
    {
      name: `${TAG} Hoodie`,
      description: "fixture",
      price: 79,
      images: ["/images/SampleProducts/kincrome1.jpg"],
      category: "apparel",
      brand: "Tools Australia",
      stock: 0,
      trackInventory: false,
      isActive: true,
    },
  ]);

  const address = {
    firstName: "Test",
    lastName: "Member",
    addressLine1: "12 Example Street",
    city: "Newcastle",
    state: "NSW" as const,
    postalCode: "2300",
  };

  const cartOf = (items: { id: mongoose.Types.ObjectId; qty: number }[]) =>
    items.map((i) => ({ productId: String(i.id), quantity: i.qty }));

  const teeOnly = cartOf([{ id: tee._id as mongoose.Types.ObjectId, qty: 2 }]);

  // ── 1. Same cart twice → one order ───────────────────────────────────────
  await test("a repeat submit of the same cart reuses the order, it does not mint a second", async () => {
    await Order.deleteMany({ user: userId });

    const first = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });
    assert.equal(first.reused, false, "the first call must create");

    const second = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });
    assert.equal(second.reused, true, "the second call must reuse");
    assert.equal(
      String(second.order._id),
      String(first.order._id),
      "reuse must return the SAME order, not a copy"
    );
    assert.equal(second.order.orderNumber, first.order.orderNumber);

    // The assertion that actually matters: read the collection back.
    const rows = await Order.countDocuments({ user: userId });
    assert.equal(rows, 1, `expected exactly 1 order row in Mongo, found ${rows}`);
  });

  // ── 2. Edited address still reuses, and persists the edit ────────────────
  await test("editing the address reuses the order and updates it", async () => {
    await Order.deleteMany({ user: userId });

    const first = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });

    const second = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: { ...address, addressLine1: "99 Corrected Road", city: "Maitland" },
    });

    assert.equal(second.reused, true, "an address edit must not create a second order");
    assert.equal(String(second.order._id), String(first.order._id));

    // Read back from Mongo — an assignment that Mongoose dropped would pass in memory.
    const stored = await Order.findById(first.order._id).lean<IOrder>();
    assert.equal(stored?.shippingAddress?.addressLine1, "99 Corrected Road");
    assert.equal(stored?.shippingAddress?.city, "Maitland");
    assert.equal(await Order.countDocuments({ user: userId }), 1);
  });

  // ── 3. Changed cart retires the old order and creates a new one ──────────
  await test("a changed cart retires the stale pending order instead of leaving it open", async () => {
    await Order.deleteMany({ user: userId });

    const first = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });

    const second = await ShopOrderService.resolvePendingOrder({
      userId,
      items: cartOf([
        { id: tee._id as mongoose.Types.ObjectId, qty: 2 },
        { id: hoodie._id as mongoose.Types.ObjectId, qty: 1 },
      ]),
      shippingAddress: address,
    });

    assert.equal(second.reused, false, "a different cart must not reuse");
    assert.notEqual(String(second.order._id), String(first.order._id));

    const old = await Order.findById(first.order._id).lean<IOrder>();
    assert.equal(old?.status, "cancelled", "the superseded order must not stay pending");
    assert.match(String(old?.notes ?? ""), /superseded/i, "and must say why");

    // Exactly one order is still open, so nothing double-counts.
    const open = await Order.countDocuments({ user: userId, status: "pending" });
    assert.equal(open, 1, `expected 1 open pending order, found ${open}`);
  });

  // ── 4. Outside the window it is litter, not a checkout in progress ───────
  await test("a pending order older than the abandonment window is not reused", async () => {
    await Order.deleteMany({ user: userId });

    const first = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });

    // Age it past the grace window.
    //
    // Through the NATIVE COLLECTION, deliberately: Mongoose marks a `timestamps`
    // -managed `createdAt` immutable, so a `$set` through the model is silently
    // STRIPPED and the document keeps its original date. The first version of this
    // test did exactly that, and failed — reporting the production filter as broken
    // when it was the fixture that had not aged anything.
    await Order.collection.updateOne(
      { _id: first.order._id as unknown as import("mongodb").ObjectId },
      { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } }
    );

    const aged = await Order.findById(first.order._id).lean<IOrder>();
    assert.ok(
      aged && Date.now() - new Date(aged.createdAt).getTime() > 60 * 60 * 1000,
      "fixture guard: the order must actually be older than the grace window"
    );

    const second = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });
    assert.equal(second.reused, false, "an hours-old pending order is not a live checkout");
    assert.notEqual(String(second.order._id), String(first.order._id));
  });

  // ── 5. The race guard ────────────────────────────────────────────────────
  await test("abandonPendingOrder cannot clobber an order the webhook already paid", async () => {
    await Order.deleteMany({ user: userId });

    const { order } = await ShopOrderService.resolvePendingOrder({
      userId,
      items: teeOnly,
      shippingAddress: address,
    });

    // The webhook wins the race.
    await Order.updateOne({ _id: order._id }, { $set: { status: "processing" } });

    await ShopOrderService.abandonPendingOrder(order, "Abandoned checkout — superseded");

    const after = await Order.findById(order._id).lean<IOrder>();
    assert.equal(
      after?.status,
      "processing",
      "a paid order must survive an abandon call — the pending filter is the guard"
    );
  });

  await cleanup();
  await mongoose.disconnect();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll tests passed");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
