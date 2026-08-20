import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import ShopEntryMultiplierConfig from "@/models/ShopEntryMultiplierConfig";
import {
  normaliseCategoryKey,
  SHOP_ENTRY_CAP_MAX,
  SHOP_ENTRY_CAP_MIN,
} from "@/utils/shop/entry-multiplier";

/**
 * A ceiling an admin may set, or null meaning "no ceiling at this tier".
 *
 * Nullable rather than merely optional: the UI has to be able to CLEAR a cap,
 * and an optional field cannot distinguish "leave it alone" from "remove it".
 */
const capSchema = z
  .number()
  .int()
  .min(SHOP_ENTRY_CAP_MIN)
  .max(SHOP_ENTRY_CAP_MAX)
  .nullable();

const updateSchema = z.object({
  cap: capSchema,
  /**
   * Keys are normalised server-side before saving, so a client sending "Apparel"
   * and one sending "apparel" cannot create two rows that shadow each other.
   */
  categoryCaps: z.record(z.string().trim().min(1), capSchema).optional(),
  /**
   * Per-product ceilings, keyed by product id. Handled here rather than through
   * the product routes so all three tiers save together on one button — a
   * partial save across tiers is how a page ends up showing a ceiling that was
   * never written.
   */
  productCaps: z
    .record(
      z.string().regex(/^[0-9a-fA-F]{24}$/, "not a product id"),
      capSchema
    )
    .optional(),
});

/**
 * GET /api/admin/shop/entry-multiplier
 *
 * The ceilings in force, plus the categories currently in use — the panel needs
 * the second to offer a list rather than a free-text box. `Product.category` has
 * no enum, and the vocabulary is already forked ("Apparel" beside
 * "power-tools"), so letting an admin type one by hand is how a cap ends up
 * silently orphaned.
 */
export async function GET() {
  try {
    const guard = await requirePermission("shop.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const config = await ShopEntryMultiplierConfig.getOrCreate();

    // Explicit projection: the admin needs a name, a category and the current
    // ceiling, and nothing else. An unprojected read here would ship variants,
    // reviews and print artwork for the whole catalogue on every page load.
    const products = await Product.find({})
      .select("_id name category entryMultiplierCap")
      .sort({ name: 1 })
      .lean<{ _id: unknown; name: string; category?: string; entryMultiplierCap?: number | null }[]>();

    const rawCategories = products.map((p) => p.category ?? "");
    // Collapsed by normalised key so "Apparel" and "apparel " offer once, not
    // twice, and the label shown is one the admin will recognise.
    const byKey = new Map<string, string>();
    for (const raw of rawCategories) {
      if (!raw.trim()) continue;
      const key = normaliseCategoryKey(raw);
      if (!byKey.has(key)) byKey.set(key, raw.trim());
    }

    const stored = config.categoryCaps ?? new Map<string, number>();
    const entries =
      stored instanceof Map
        ? [...stored.entries()]
        : Object.entries(stored as unknown as Record<string, number>);

    return NextResponse.json({
      success: true,
      data: {
        cap: config.cap ?? null,
        categoryCaps: Object.fromEntries(entries),
        categories: [...byKey.entries()]
          .map(([key, label]) => ({ key, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        products: products.map((prod) => ({
          id: String(prod._id),
          name: prod.name,
          category: prod.category ?? "",
          cap: prod.entryMultiplierCap ?? null,
        })),
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching shop entry multiplier config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch shop entry multiplier configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/shop/entry-multiplier
 *
 * Replaces the ceilings wholesale. No merge: a partial update could not express
 * "remove this category's cap", and a panel that can add but not remove is worse
 * than no panel.
 */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "shop-entry-multiplier",
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectDB();
    const config = await ShopEntryMultiplierConfig.getOrCreate();

    config.cap = parsed.data.cap;

    // Normalised on write as well as on read. Applying it to only one side is
    // worse than neither, because the mismatch then depends on which value
    // happened to be saved first.
    const next = new Map<string, number>();
    for (const [rawKey, value] of Object.entries(parsed.data.categoryCaps ?? {})) {
      if (value == null) continue; // null clears the row
      next.set(normaliseCategoryKey(rawKey), value);
    }
    config.categoryCaps = next;

    config.updatedBy = new mongoose.Types.ObjectId(session.user.id);
    await config.save();

    // One bulkWrite rather than a request per product: the panel saves every
    // tier at once, and N round-trips would leave the page showing ceilings that
    // only partly landed if one failed.
    const productEntries = Object.entries(parsed.data.productCaps ?? {});
    if (productEntries.length > 0) {
      await Product.bulkWrite(
        productEntries.map(([id, cap]) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(id) },
            // null is meaningful — it CLEARS the ceiling so the product falls
            // through to its category, then to the shop-wide value.
            update: { $set: { entryMultiplierCap: cap } },
          },
        }))
      );
    }

    await log(200);
    return NextResponse.json({
      success: true,
      data: {
        cap: config.cap ?? null,
        categoryCaps: Object.fromEntries(next),
        productsUpdated: productEntries.length,
      },
    });
  } catch (error) {
    console.error("Error updating shop entry multiplier config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update shop entry multiplier configuration" },
      { status: 500 }
    );
  }
}
