import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
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

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  price: z.number().min(0).optional(),
  images: z.array(z.string().url()).min(1).optional(),
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  variants: z.array(variantSchema).min(1).optional(),
  includedEntries: z.number().int().min(0).optional(),
  entryMultiplier: z.number().int().min(1).max(10).nullable().optional(),
  printArtwork: z.array(artworkSchema).optional(),
  trackInventory: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().trim()).optional(),
  originLocation: z.string().trim().max(64).optional(),
});

const toggleSchema = z.object({ isActive: z.boolean() });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const input = updateSchema.parse(await request.json());

    await connectDB();
    const product = await ProductAdminService.update(id, input);
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating product:", error);
    return NextResponse.json({ success: false, error: "Failed to update product" }, { status: 500 });
  }
}

/** Activate / deactivate. Deactivating every product is the shop's kill switch. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const { isActive } = toggleSchema.parse(await request.json());

    await connectDB();
    const product = await ProductAdminService.setActive(id, isActive);
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error toggling product:", error);
    return NextResponse.json({ success: false, error: "Failed to toggle product" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.delete", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const removed = await ProductAdminService.remove(id);
    if (!removed) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json({ success: false, error: "Failed to delete product" }, { status: 500 });
  }
}
