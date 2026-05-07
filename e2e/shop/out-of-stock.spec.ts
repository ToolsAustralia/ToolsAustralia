import { test, expect } from "../fixtures/test";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";
import Product from "@/models/Product";
import mongoose from "mongoose";

// Drives the cartValidation 400 branch of POST /api/stripe/create-shop-purchase.
// We pre-create a product, manually set its stock to 0 in the dev DB, then attempt
// checkout. The orchestrator should reject the cart with `insufficient_stock`.

let productId: string;

test.beforeAll(async () => {
  productId = (await ensureE2EProducts()).widgetId;
});
test.afterAll(async () => {
  await teardownE2EProducts();
});

test("creating a shop PI with an out-of-stock product returns 400", async ({ request }) => {
  // First force stock to zero. Quickest way: hit Mongo directly via a test helper
  // route, OR rely on Product.findOneAndUpdate from the spec via mongoose.
  await Product.updateOne({ _id: productId }, { $set: { stock: 0 } });

  const res = await request.post("/api/stripe/create-shop-purchase", {
    data: {
      items: [{ productId, quantity: 1 }],
      shippingAddress: {
        firstName: "Out",
        lastName: "OfStock",
        email: "oos@example.com",
        phone: "0400000000",
        addressLine1: "1 Stock St",
        city: "Melbourne",
        state: "VIC",
        postalCode: "3000",
      },
    },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.errors?.[0]?.reason).toBe("insufficient_stock");

  await mongoose.disconnect();
});
