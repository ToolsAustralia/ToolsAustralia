import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Reenacts the shop money bug found on 2026-08-28.
 *
 * THE CLAIM
 *   When a buyer changes their cart mid-checkout, `ShopOrderService.resolvePendingOrder`
 *   retires the superseded order via `abandonPendingOrder` — which flips it to
 *   `cancelled` and does NOT cancel the Stripe PaymentIntent behind it. That intent
 *   stays payable. If the buyer pays it from a stale tab:
 *     • `finalizeShopOrder` sees `status === "cancelled"`, assumes "auto-refunded for
 *       lost stock", and returns `already_processed` — no stock, no entries, no receipt.
 *     • `refundShopOrder` refuses with `already_refunded`, so staff cannot fix it.
 *   Net: money captured, nothing delivered, no refund path.
 *
 * NOTHING IS MOCKED — real services, real Stripe (test mode), real Mongo. The database
 * MUST be an isolated local instance; this script refuses to run against anything else.
 *
 *   docker run -d --name ta-repro-mongo -p 27018:27017 mongo:7
 *   MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro npx tsx scripts/smoke-shop-abandoned-intent.ts
 *
 * Expect while broken: "MONEY TAKEN, NOTHING DELIVERED", exit 1.
 */

const PAYABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action"]);

async function main(): Promise<boolean> {
  const uri = process.env.MONGODB_URI || "";
  if (!/(127\.0\.0\.1|localhost)/.test(uri)) {
    console.error("REFUSING: MONGODB_URI is not local. This repro must never touch a remote cluster.");
    process.exit(2);
  }
  if (!(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test")) {
    console.error("REFUSING: STRIPE_SECRET_KEY is not a test-mode key.");
    process.exit(2);
  }

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(uri);

  const { stripe } = await import("@/lib/stripe");
  const { default: User } = await import("@/models/User");
  const { default: Product } = await import("@/models/Product");
  const { default: Order } = await import("@/models/Order");
  const { startShopCheckout } = await import("@/services/shop/startShopCheckout");
  const { finalizeShopOrder } = await import("@/services/shop/finalizeShopOrder");
  const { refundShopOrder } = await import("@/services/shop/refundShopOrder");

  // ── Seed a catalogue and a buyer. ─────────────────────────────────────────────
  await Product.deleteMany({ brand: "ReproBrand" });
  const mk = (name: string, price: number) =>
    Product.create({
      name, description: `${name} for the repro`, price,
      images: ["/images/repro.webp"], category: "apparel", brand: "ReproBrand",
      stock: 100, isActive: true, variants: [],
    });
  const tee = await mk("Repro Tee", 39.95);
  const cap = await mk("Repro Cap", 24.95);

  await User.deleteMany({ email: "shopper@example.test" });
  const buyer = await User.create({
    email: "shopper@example.test", firstName: "Shop", lastName: "Per", isActive: true,
    accumulatedEntries: 0,
    cart: [{ type: "product", productId: tee._id, quantity: 1 }],
  });

  const address = {
    fullName: "Shop Per", line1: "1 Test St", suburb: "Melbourne",
    state: "VIC", postcode: "3000", country: "Australia",
  };

  // ── STEP 1 — buyer opens checkout with cart A. ────────────────────────────────
  await startShopCheckout({ user: buyer as never, shippingAddress: address as never });
  const orderA = await Order.findOne({ user: buyer._id }).sort({ createdAt: -1 });
  console.log(`STEP 1  checkout with cart A (tee only)`);
  console.log(`        -> order ${orderA?.orderNumber}  status=${orderA?.status}  intent=${orderA?.paymentIntentId}`);
  const intentA = String(orderA?.paymentIntentId);

  // ── STEP 2 — buyer adds an item in another tab and continues. ─────────────────
  const reload = await User.findById(buyer._id);
  reload!.cart = [
    { type: "product", productId: tee._id, quantity: 1 },
    { type: "product", productId: cap._id, quantity: 1 },
  ] as never;
  await reload!.save();
  await startShopCheckout({ user: reload as never, shippingAddress: address as never });

  const orderAAfter = await Order.findById(orderA!._id);
  console.log(`\nSTEP 2  checkout again with cart B (tee + cap)`);
  console.log(`        -> order A is now status=${orderAAfter?.status}  notes="${orderAAfter?.notes ?? ""}"`);

  // ── STEP 3 — is order A's Stripe intent still payable? ────────────────────────
  const piA = await stripe.paymentIntents.retrieve(intentA);
  console.log(`\nSTEP 3  order A was retired. What happened to its PaymentIntent?`);
  console.log(`        -> ${piA.id} status=${piA.status}  payable=${PAYABLE.has(piA.status)}`);
  if (!PAYABLE.has(piA.status)) {
    console.log("\nThe abandoned intent is no longer payable — the bug does not reproduce at the source.");
    return true;
  }

  // ── STEP 4 — buyer pays the stale tab. ────────────────────────────────────────
  const paid = await stripe.paymentIntents.confirm(piA.id, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3100/checkout/success",
  });
  console.log(`\nSTEP 4  buyer returns to the stale tab and pays`);
  console.log(`        -> status=${paid.status}  amount=${paid.amount} ${paid.currency}  (money captured)`);

  // ── STEP 5 — what does the webhook path do with it? ───────────────────────────
  const outcome = await finalizeShopOrder(paid as never, { requestContext: {} as never });
  const orderAFinal = await Order.findById(orderA!._id);
  const buyerFinal = await User.findById(buyer._id);
  console.log(`\nSTEP 5  finalizeShopOrder (what the Stripe webhook calls)`);
  console.log(`        -> result           : ${JSON.stringify(outcome)}`);
  console.log(`        -> order A status   : ${orderAFinal?.status}`);
  console.log(`        -> entriesGranted   : ${orderAFinal?.entriesGranted ?? "(none)"}`);
  console.log(`        -> buyer entries    : ${buyerFinal?.accumulatedEntries}`);

  // ── STEP 6 — can staff refund it? ─────────────────────────────────────────────
  const refund = await refundShopOrder({ orderId: String(orderA!._id), reason: "repro" });
  console.log(`\nSTEP 6  staff try to refund order A`);
  console.log(`        -> ${JSON.stringify(refund)}`);

  const moneyTaken = paid.status === "succeeded";
  const nothingDelivered = !orderAFinal?.entriesGranted && (buyerFinal?.accumulatedEntries ?? 0) === 0;
  const refundBlocked = refund.status !== "refunded";

  console.log("\n------------------------------------------------------------");
  if (moneyTaken && nothingDelivered && refundBlocked) {
    console.log("MONEY TAKEN, NOTHING DELIVERED");
    console.log(`   A$${(paid.amount / 100).toFixed(2)} captured. No entries, no fulfilment,`);
    console.log(`   and the refund tool reports "${refund.status}" so staff cannot make it right.`);
    return false;
  }
  console.log("Did not reproduce at the source — see the step output above.");
  return true;
}

/**
 * DEFENCE IN DEPTH — the safety net, which the primary fix should make unreachable.
 *
 * Cancelling the intent closes the hole from our side, but a Stripe-side race, a cancel
 * that fails, or a row cancelled before `cancellationReason` existed can all still put a
 * payment on a retired order. This drives that case directly: retire an order WITHOUT
 * cancelling its intent, pay it, and assert `finalizeShopOrder` refunds instead of
 * swallowing it as `already_processed`.
 */
async function safetyNetRefundsMoneyOnARetiredOrder(): Promise<boolean> {
  const { stripe } = await import("@/lib/stripe");
  const { default: User } = await import("@/models/User");
  const { default: Order } = await import("@/models/Order");
  const { startShopCheckout } = await import("@/services/shop/startShopCheckout");
  const { finalizeShopOrder } = await import("@/services/shop/finalizeShopOrder");
  const { refundShopOrder } = await import("@/services/shop/refundShopOrder");

  const buyer = await User.findOne({ email: "shopper@example.test" });
  const address = {
    fullName: "Shop Per", line1: "1 Test St", suburb: "Melbourne",
    state: "VIC", postcode: "3000", country: "Australia",
  };
  buyer!.cart = buyer!.cart?.slice(0, 1) as never;
  await buyer!.save();

  await startShopCheckout({ user: buyer as never, shippingAddress: address as never });
  const order = await Order.findOne({ user: buyer!._id, status: "pending" }).sort({ createdAt: -1 });
  const intentId = String(order!.paymentIntentId);

  // Retire it the OLD way — status only, intent left alive. This is the race.
  await Order.updateOne(
    { _id: order!._id },
    { status: "cancelled", notes: "Simulated race", cancellationReason: "abandoned" }
  );
  const paid = await stripe.paymentIntents.confirm(intentId, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3100/checkout/success",
  });

  console.log(`\nSAFETY NET  order retired with its intent still live, then paid`);
  console.log(`        -> intent ${paid.id} status=${paid.status} amount=${paid.amount}`);

  const outcome = await finalizeShopOrder(paid as never, { requestContext: {} as never });
  const after = await Order.findById(order!._id);
  const refreshed = await stripe.paymentIntents.retrieve(intentId);
  const charge = typeof refreshed.latest_charge === "string"
    ? await stripe.charges.retrieve(refreshed.latest_charge)
    : null;

  console.log(`        -> finalizeShopOrder : ${JSON.stringify(outcome)}`);
  console.log(`        -> cancellationReason: ${after?.cancellationReason}`);
  console.log(`        -> refunded at Stripe: ${charge?.refunded} (${charge?.amount_refunded} of ${charge?.amount})`);

  const refundAgain = await refundShopOrder({ orderId: String(order!._id), reason: "repro" });
  console.log(`        -> staff refund now says: ${refundAgain.status}`);

  const ok =
    outcome.status === "refunded_order_retired" &&
    charge?.refunded === true &&
    after?.cancellationReason === "refunded" &&
    refundAgain.status === "already_refunded";
  console.log(ok
    ? "        -> the money was returned automatically and the record is honest"
    : "        -> SAFETY NET FAILED — money would be kept on a retired order");
  return ok;
}

async function run() {
  const sourceFixed = await main();
  const netHolds = await safetyNetRefundsMoneyOnARetiredOrder();
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  console.log("\n------------------------------------------------------------");
  console.log(`abandoned intent no longer payable : ${sourceFixed ? "yes" : "NO"}`);
  console.log(`safety net refunds if it ever is   : ${netHolds ? "yes" : "NO"}`);
  // Both must hold: closing the hole at the source AND refunding if money still lands.
  process.exit(sourceFixed && netHolds ? 0 : 1);
}

run().catch((e) => {
  console.error("\nrepro error:", e instanceof Error ? e.message : e);
  process.exit(2);
});
