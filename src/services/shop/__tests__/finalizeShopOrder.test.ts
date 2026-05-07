// src/services/shop/__tests__/finalizeShopOrder.test.ts
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { finalizeShopOrder } from "../finalizeShopOrder.service";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// NOTE: this test uses real Mongo + real BUSINESS config. Stripe refunds in the
// stockLost path would hit Stripe live, so the stockLost case is exercised only
// via Playwright e2e (real Stripe test PIs) — see e2e/shop/out-of-stock.spec.ts.

const PI_PREFIX = "test_pi_finalize_";

function makeFakePI(input: {
  type: "shop" | "other";
  id: string;
  items: { productId: string; productName: string; priceCents: number; quantity: number; imageUrl: null; brand: null }[];
  guestEmail: string;
  totalCents: number;
}) {
  return {
    id: input.id,
    metadata: {
      type: input.type,
      items: JSON.stringify(input.items),
      shippingAddress: JSON.stringify({
        firstName: "Test",
        lastName: "Buyer",
        email: input.guestEmail,
        phone: "0400000000",
        addressLine1: "1 Test St",
        city: "Melbourne",
        state: "VIC",
        postalCode: "3000",
        country: "Australia",
      }),
      guestEmail: input.guestEmail,
      guestFirstName: "Test",
      guestLastName: "Buyer",
      subtotalCents: String(input.items.reduce((s, i) => s + i.priceCents * i.quantity, 0)),
      shippingCents: "1000",
      gstCents: String(Math.round(input.totalCents / 11)),
      totalCents: String(input.totalCents),
    },
  } as unknown as import("stripe").Stripe.PaymentIntent;
}

async function main() {
  await connectDB();
  const TEST_PREFIX = "test-finalize-";
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await Order.deleteMany({ paymentIntentId: { $regex: `^${PI_PREFIX}` } });

  const product = await Product.create({
    name: `${TEST_PREFIX}widget`,
    description: "x",
    price: 25,
    images: ["http://example.com/x.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });

  // skipped_not_shop
  const r0 = await finalizeShopOrder({
    paymentIntent: makeFakePI({
      type: "other",
      id: `${PI_PREFIX}skip`,
      items: [],
      guestEmail: "skip@x.com",
      totalCents: 0,
    }),
  });
  assert(r0.status === "skipped_not_shop", "non-shop PI is skipped");

  // happy path
  const items = [
    {
      productId: product._id.toString(),
      productName: product.name,
      priceCents: 2500,
      quantity: 2,
      imageUrl: null,
      brand: null,
    },
  ];
  const r1 = await finalizeShopOrder({
    paymentIntent: makeFakePI({
      type: "shop",
      id: `${PI_PREFIX}happy`,
      items,
      guestEmail: "h@x.com",
      totalCents: 6000, // 2*25 + 10 shipping
    }),
  });
  assert(r1.status === "order_written", "happy path writes order");
  const fresh = await Product.findById(product._id);
  assert(fresh!.stock === 8, "stock decremented by 2");
  const order = await Order.findOne({ paymentIntentId: `${PI_PREFIX}happy` });
  assert(order !== null, "order row exists");
  assert(order!.guestEmail === "h@x.com", "guestEmail set");
  assert(order!.user === undefined || order!.user === null, "user not set for guest");

  // Stock-race + refund branch is exercised by Playwright e2e (real Stripe test PIs).

  // Cleanup
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await Order.deleteMany({ paymentIntentId: { $regex: `^${PI_PREFIX}` } });
  await mongoose.disconnect();
  console.log("finalizeShopOrder: ALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
