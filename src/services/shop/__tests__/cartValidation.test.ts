// src/services/shop/__tests__/cartValidation.test.ts
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { validateCart } from "../cartValidation.service";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

async function main() {
  await connectDB();

  // Setup: create test products with deterministic prefix
  const TEST_PREFIX = "test-cart-validation-";
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });

  const active = await Product.create({
    name: `${TEST_PREFIX}active`,
    description: "Active product",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });
  const inactive = await Product.create({
    name: `${TEST_PREFIX}inactive`,
    description: "Inactive",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: false,
  });
  const lowStock = await Product.create({
    name: `${TEST_PREFIX}low-stock`,
    description: "Low",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 1,
    isActive: true,
  });

  // Happy path
  const v1 = await validateCart({
    items: [{ productId: active._id.toString(), quantity: 2 }],
  });
  assert(v1.errors.length === 0, "happy path no errors");
  assert(v1.validatedItems[0].priceCents === 2500, "price taken from DB in cents");
  assert(v1.validatedItems[0].quantity === 2, "quantity preserved");

  // Inactive product
  const v2 = await validateCart({ items: [{ productId: inactive._id.toString(), quantity: 1 }] });
  assert(v2.errors.length === 1, "inactive raises error");
  assert(v2.errors[0].productId === inactive._id.toString(), "error references productId");

  // Insufficient stock
  const v3 = await validateCart({ items: [{ productId: lowStock._id.toString(), quantity: 5 }] });
  assert(v3.errors.length === 1, "insufficient stock raises error");
  assert(v3.errors[0].reason === "insufficient_stock", "reason set correctly");

  // Missing product
  const fakeId = new mongoose.Types.ObjectId().toString();
  const v4 = await validateCart({ items: [{ productId: fakeId, quantity: 1 }] });
  assert(v4.errors.length === 1, "missing product raises error");
  assert(v4.errors[0].reason === "not_found", "reason = not_found");

  // Cleanup
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();

  console.log("cartValidation: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
