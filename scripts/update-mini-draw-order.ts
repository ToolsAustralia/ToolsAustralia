#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import process from "process";
import mongoose from "mongoose";
import connectDB from "../src/lib/mongodb";
import MiniDraw from "../src/models/MiniDraw";

interface MiniDrawOrderInput {
  id: string;
  brandId?: string;
  displayOrder?: number;
}

async function run() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx scripts/update-mini-draw-order.ts ./mini-draw-order.json");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Config file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as MiniDrawOrderInput[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error("Config file must be a non-empty array of { id, brandId?, displayOrder? } objects.");
    process.exit(1);
  }

  const operations = parsed.map((entry, index) => {
    if (!entry.id) {
      throw new Error(`Entry at index ${index} is missing an id`);
    }
    const update: Record<string, unknown> = {};
    if (entry.brandId) {
      update.brandId = entry.brandId;
    }
    update.displayOrder =
      typeof entry.displayOrder === "number" && Number.isFinite(entry.displayOrder) ? entry.displayOrder : index + 1;

    return {
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(entry.id) },
        update: { $set: update },
      },
    };
  });

  await connectDB();
  const result = await MiniDraw.bulkWrite(operations);
  console.log(`Updated ${result.modifiedCount} mini draws using ${resolvedPath}`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Mini draw order update failed:", error);
  process.exit(1);
});



