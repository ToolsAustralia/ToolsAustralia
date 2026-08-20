import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { ProductAdminService } from "@/services/shop/ProductAdminService";

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  size: z.string().trim().max(32).optional(),
  colour: z.string().trim().max(32).optional(),
  gtin: z.string().trim().max(32).optional(),
  isActive: z.boolean().optional(),
});

const artworkSchema = z.object({
  url: z.string().url(),
  placement: z.string().trim().min(1).max(8),
  type: z.enum(["printing", "mockup"]),
});

/**
 * A product image: either an absolute URL (Cloudinary, the print provider) or a
 * ROOT-RELATIVE path served by this app (`/images/...`).
 *
 * `z.string().url()` alone rejected the second kind, which is what the seeded
 * tool catalogue uses — so every tool product failed validation the moment an
 * admin pressed Save, on a form where they had changed nothing about the images.
 *
 * Root-relative only. A bare `images/x.png` or a protocol-relative `//host/x.png`
 * is not accepted: the first breaks depending on the page it is rendered from,
 * and the second is an off-site fetch wearing a relative path's clothes.
 */
const productImage = z
  .string()
  .trim()
  .min(1)
  .refine((v) => v.startsWith("/") && !v.startsWith("//"), {
    message: "must be an absolute URL or a root-relative path like /images/x.png",
  })
  .or(z.string().trim().url());
const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  price: z.number().min(0),
  images: z.array(productImage).min(1),
  category: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  // NOT .min(1): a product with no variants is legitimate and purchasable —
  // checkout explicitly handles it (`if (variants.length > 0)` in
  // ShopOrderService.resolveLines). Requiring one here blocked editing every
  // tool in the catalogue, none of which has variants.
  variants: z.array(variantSchema),
  includedEntries: z.number().int().min(0).optional(),
  entryMultiplier: z.number().int().min(1).max(10).nullable().optional(),
  printArtwork: z.array(artworkSchema).optional(),
  trackInventory: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().trim()).optional(),
  originLocation: z.string().trim().max(64).optional(),
});

export async function GET() {
  try {
    const guard = await requirePermission("shop.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const products = await ProductAdminService.list();
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("Error listing products:", error);
    return NextResponse.json({ success: false, error: "Failed to list products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const input = productSchema.parse(await request.json());

    await connectDB();
    const product = await ProductAdminService.create(input);

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating product:", error);
    return NextResponse.json({ success: false, error: "Failed to create product" }, { status: 500 });
  }
}
