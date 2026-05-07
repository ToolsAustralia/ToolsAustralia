/**
 * Seed shop products for local development.
 *
 * Idempotent — products are tagged with `seed` so re-running upserts by name
 * rather than duplicating. Pass `--clear` to remove all seeded products instead.
 *
 * Usage:
 *   npm run seed:shop
 *   npm run seed:shop -- --clear
 *
 * Note: This is dev fixture data. Production product catalog should be managed
 * via the admin UI / proper migrations, not this script.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

const SEED_TAG = "seed";

interface SeedProduct {
  name: string;
  description: string;
  price: number;
  brand: string;
  category: string;
  images: string[];
  stock: number;
  features: string[];
  specifications: Record<string, string>;
  rating: number;
  isFeatured?: boolean;
}

const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: "DeWalt 18V Cordless Drill Combo Kit",
    description:
      "Professional-grade 18V cordless drill kit with two batteries, charger, and hard case. Brushless motor for longer runtime and durability.",
    price: 399,
    brand: "DeWalt",
    category: "power-tools",
    images: ["/images/SampleProducts/dewalt1.jpg", "/images/SampleProducts/dewalt2.jpg"],
    stock: 25,
    features: ["18V Brushless", "2 Batteries Included", "LED Light", "1.5Ah Lithium-Ion"],
    specifications: {
      voltage: "18V",
      batteryAh: "1.5",
      maxTorque: "65Nm",
      weight: "1.5kg",
    },
    rating: 4.8,
    isFeatured: true,
  },
  {
    name: "DeWalt Heavy-Duty Impact Driver",
    description:
      "High-torque impact driver for the toughest fastening jobs. Compact head length for tight spaces.",
    price: 249,
    brand: "DeWalt",
    category: "power-tools",
    images: ["/images/SampleProducts/dewalt2.jpg"],
    stock: 18,
    features: ["3-Speed Selector", "Quick-Change Chuck", "Belt Hook"],
    specifications: {
      voltage: "18V",
      maxTorque: "205Nm",
      ipm: "3,200",
    },
    rating: 4.7,
  },
  {
    name: "Kincrome Multi-Use Electric Hammer",
    description:
      "Heavy-duty electric hammer for masonry and concrete work. Anti-vibration handle reduces fatigue.",
    price: 179,
    brand: "Kincrome",
    category: "power-tools",
    images: ["/images/SampleProducts/kincrome1.jpg", "/images/SampleProducts/kincrome2.jpg"],
    stock: 35,
    features: ["Anti-vibration", "Heavy-duty", "Variable speed"],
    specifications: {
      power: "1200W",
      impactFrequency: "4500bpm",
      voltage: "240V",
    },
    rating: 4.6,
  },
  {
    name: "Makita Brushless Cordless Circular Saw",
    description:
      "Lightweight brushless 18V circular saw. 165mm blade, max cutting depth 57mm at 90°.",
    price: 329,
    brand: "Makita",
    category: "power-tools",
    images: ["/images/SampleProducts/makita1.jpg", "/images/SampleProducts/makita2.webp"],
    stock: 12,
    features: ["Brushless Motor", "Electric Brake", "LED Job Light"],
    specifications: {
      voltage: "18V",
      bladeSize: "165mm",
      maxCutDepth90: "57mm",
      weight: "3.0kg",
    },
    rating: 4.9,
    isFeatured: true,
  },
  {
    name: "Milwaukee M18 FUEL Hammer Drill",
    description:
      "Industry-leading hammer drill with POWERSTATE brushless motor and REDLINK PLUS intelligence.",
    price: 449,
    brand: "Milwaukee",
    category: "power-tools",
    images: [
      "/images/SampleProducts/milwaukee1.jpg",
      "/images/SampleProducts/milwaukee2.jpg",
    ],
    stock: 8,
    features: ["POWERSTATE Brushless", "REDLINK PLUS", "All-Metal Gear Case"],
    specifications: {
      voltage: "18V",
      maxTorque: "135Nm",
      bpm: "32,000",
    },
    rating: 4.9,
  },
  {
    name: "Sidchrome Digital Spirit Level 600mm",
    description:
      "Professional precision digital magnetic spirit level with internal memory. 0.1° accuracy.",
    price: 89,
    brand: "Sidchrome",
    category: "measuring",
    images: ["/images/SampleProducts/sidchrome1.jpg"],
    stock: 60,
    features: ["Digital Display", "Magnetic Base", "99-Point Memory", "Battery Powered"],
    specifications: {
      length: "600mm",
      accuracy: "0.1°",
      memoryPoints: "99",
    },
    rating: 4.7,
  },
];

async function clearSeed() {
  await connectDB();
  const result = await Product.deleteMany({ tags: SEED_TAG });
  console.log(`[seed-shop] removed ${result.deletedCount} seed products`);
  await mongoose.disconnect();
}

async function seed() {
  await connectDB();

  let created = 0;
  let updated = 0;

  for (const p of SEED_PRODUCTS) {
    const existing = await Product.findOne({ name: p.name, tags: SEED_TAG });
    if (existing) {
      // Refresh fields in case the seed data drifted, but preserve _id and reviews
      existing.set({
        description: p.description,
        price: p.price,
        brand: p.brand,
        category: p.category,
        images: p.images,
        stock: p.stock,
        features: p.features,
        specifications: p.specifications,
        rating: p.rating,
        isActive: true,
        isFeatured: p.isFeatured ?? false,
      });
      await existing.save();
      updated += 1;
      console.log(`[seed-shop] ↻ ${p.name} (_id=${existing._id})`);
    } else {
      const doc = await Product.create({
        ...p,
        isActive: true,
        isFeatured: p.isFeatured ?? false,
        tags: [SEED_TAG, p.brand.toLowerCase(), p.category],
      });
      created += 1;
      console.log(`[seed-shop] + ${p.name} (_id=${doc._id})`);
    }
  }

  console.log(`[seed-shop] done. created=${created} updated=${updated} total=${SEED_PRODUCTS.length}`);
  console.log(
    `[seed-shop] visit http://localhost:3000/shop to browse, or use any _id above for the webhook replay script:`,
  );
  console.log(`[seed-shop]   npm run test:shop-webhook -- <_id>`);
  await mongoose.disconnect();
}

const shouldClear = process.argv.includes("--clear");
const job = shouldClear ? clearSeed : seed;

job().catch((err) => {
  console.error("[seed-shop] failed:", err);
  process.exit(1);
});
