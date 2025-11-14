import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const stockUpdateSchema = z.object({
  quantity: z.number().int().min(0),
  operation: z.enum(["add", "subtract", "set"]),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);

    const product = await Product.findById(id).select("stock name").lean();
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Type assertion to handle the lean() return type
    const productData = product as Record<string, unknown>;

    return NextResponse.json({
      productId: id,
      productName: productData.name as string,
      stock: productData.stock as number,
      inStock: (productData.stock as number) > 0,
    });
  } catch (error) {
    console.error("Error fetching product stock:", error);
    return NextResponse.json({ error: "Failed to fetch product stock" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = stockUpdateSchema.parse(body);

    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    let newStock = product.stock;
    switch (validatedData.operation) {
      case "add":
        newStock += validatedData.quantity;
        break;
      case "subtract":
        newStock = Math.max(0, newStock - validatedData.quantity);
        break;
      case "set":
        newStock = validatedData.quantity;
        break;
    }

    product.stock = newStock;
    await product.save();

    return NextResponse.json({
      message: "Stock updated successfully",
      productId: id,
      productName: product.name,
      previousStock: product.stock,
      newStock: newStock,
      operation: validatedData.operation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating product stock:", error);
    return NextResponse.json({ error: "Failed to update product stock" }, { status: 500 });
  }
}
