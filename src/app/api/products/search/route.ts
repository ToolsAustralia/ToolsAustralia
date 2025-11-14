import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  sort: z.enum(["price-asc", "price-desc", "rating", "newest"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const category = searchParams.get("category") || undefined;
    const brand = searchParams.get("brand") || undefined;
    const minPrice = searchParams.get("minPrice") || undefined;
    const maxPrice = searchParams.get("maxPrice") || undefined;
    const sort = searchParams.get("sort") as "price-asc" | "price-desc" | "rating" | "newest" | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");

    const validatedParams = searchSchema.parse({
      q: query,
      category,
      brand,
      minPrice,
      maxPrice,
      sort,
      page: page.toString(),
      limit: limit.toString(),
    });

    // Build search query
    const searchQuery: Record<string, unknown> = {
      isActive: true,
    };

    if (validatedParams.q) {
      searchQuery.$or = [
        { name: { $regex: validatedParams.q, $options: "i" } },
        { description: { $regex: validatedParams.q, $options: "i" } },
        { brand: { $regex: validatedParams.q, $options: "i" } },
        { category: { $regex: validatedParams.q, $options: "i" } },
        { tags: { $in: [new RegExp(validatedParams.q, "i")] } },
      ];
    }

    if (validatedParams.category) {
      searchQuery.category = { $regex: validatedParams.category, $options: "i" };
    }

    if (validatedParams.brand) {
      searchQuery.brand = { $regex: validatedParams.brand, $options: "i" };
    }

    if (validatedParams.minPrice || validatedParams.maxPrice) {
      searchQuery.price = {} as Record<string, number>;
      if (validatedParams.minPrice) {
        (searchQuery.price as Record<string, number>).$gte = parseFloat(validatedParams.minPrice);
      }
      if (validatedParams.maxPrice) {
        (searchQuery.price as Record<string, number>).$lte = parseFloat(validatedParams.maxPrice);
      }
    }

    // Build sort object
    let sortObj: Record<string, 1 | -1> = { createdAt: -1 }; // Default sort by newest
    if (validatedParams.sort) {
      switch (validatedParams.sort) {
        case "price-asc":
          sortObj = { price: 1 };
          break;
        case "price-desc":
          sortObj = { price: -1 };
          break;
        case "rating":
          sortObj = { rating: -1 };
          break;
        case "newest":
          sortObj = { createdAt: -1 };
          break;
      }
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute search
    const [products, totalCount] = await Promise.all([
      Product.find(searchQuery).sort(sortObj).skip(skip).limit(limit).lean(),
      Product.countDocuments(searchQuery),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 });
  }
}
