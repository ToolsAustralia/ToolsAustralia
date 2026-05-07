// e2e/fixtures/test-products.ts
//
// Manage shop products used by Playwright e2e specs. Each spec calls
// `ensureE2EProducts()` in `beforeAll` and `teardownE2EProducts()` in
// `afterAll` so test data is deterministic and self-cleaning.
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

const TEST_PREFIX = "test-shop-e2e-";

export async function ensureE2EProducts() {
  await connectDB();
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });

  const widget = await Product.create({
    name: `${TEST_PREFIX}widget`,
    description: "E2E test widget",
    price: 25,
    images: ["https://placehold.co/400"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });
  return { widgetId: widget._id.toString() };
}

export async function teardownE2EProducts() {
  await connectDB();
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
}

if (require.main === module) {
  ensureE2EProducts().then((ids) => {
    console.log(JSON.stringify(ids));
    return mongoose.disconnect();
  });
}
