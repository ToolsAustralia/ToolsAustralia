import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const productImportSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  images: z.array(z.string().url()).min(1),
  category: z.string().min(1),
  brand: z.string().min(1),
  stock: z.number().int().min(0),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
});

const importSchema = z.object({
  products: z.array(productImportSchema),
  overwrite: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = importSchema.parse(body);

    const results = {
      imported: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const productData of validatedData.products) {
      try {
        if (validatedData.overwrite) {
          // Update existing product or create new one
          const existingProduct = await Product.findOne({
            name: productData.name,
            brand: productData.brand,
          });

          if (existingProduct) {
            await Product.findByIdAndUpdate(existingProduct._id, productData);
            results.updated++;
          } else {
            const newProduct = new Product(productData);
            await newProduct.save();
            results.imported++;
          }
        } else {
          // Only create new products
          const newProduct = new Product(productData);
          await newProduct.save();
          results.imported++;
        }
      } catch (error) {
        results.errors.push(`Failed to import product "${productData.name}": ${error}`);
      }
    }

    return NextResponse.json({
      message: "Product import completed",
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error importing products:", error);
    return NextResponse.json({ error: "Failed to import products" }, { status: 500 });
  }
}
