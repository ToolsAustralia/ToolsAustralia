import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";
// import { Product as ProductType, ProductSearchResult } from "@/types/product"; // TODO: Use for type validation

// Query parameters validation
const querySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("12"),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  sortBy: z.enum(["name", "price", "rating", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  featured: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    // Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = querySchema.parse(query);
    } catch (validationError) {
      return NextResponse.json({ error: "Invalid query parameters", details: validationError }, { status: 400 });
    }

    // Build filter object
    const filter: Record<string, unknown> = { isActive: true };

    if (validatedQuery.category) {
      filter.category = { $regex: validatedQuery.category, $options: "i" };
    }

    if (validatedQuery.brand) {
      filter.brand = { $regex: validatedQuery.brand, $options: "i" };
    }

    if (validatedQuery.minPrice || validatedQuery.maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (validatedQuery.minPrice) {
        priceFilter.$gte = parseFloat(validatedQuery.minPrice);
      }
      if (validatedQuery.maxPrice) {
        priceFilter.$lte = parseFloat(validatedQuery.maxPrice);
      }
      filter.price = priceFilter;
    }

    if (validatedQuery.featured === "true") {
      filter.isFeatured = true;
    }

    if (validatedQuery.search) {
      filter.$or = [
        { name: { $regex: validatedQuery.search, $options: "i" } },
        { description: { $regex: validatedQuery.search, $options: "i" } },
        { brand: { $regex: validatedQuery.search, $options: "i" } },
        { category: { $regex: validatedQuery.search, $options: "i" } },
      ];
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[validatedQuery.sortBy] = validatedQuery.sortOrder === "asc" ? 1 : -1;

    // Calculate pagination
    const page = parseInt(validatedQuery.page);
    const limit = parseInt(validatedQuery.limit);
    const skip = (page - 1) * limit;

    // Execute query with timeout and optimization
    const queryTimeout = 10000; // 10 seconds timeout

    const [products, totalCount] = (await Promise.race([
      Promise.all([
        Product.find(filter).sort(sort).skip(skip).limit(limit).lean().maxTimeMS(queryTimeout),
        Product.countDocuments(filter).maxTimeMS(queryTimeout),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout")), queryTimeout)),
    ])) as [unknown[], number];

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === "Query timeout") {
        return NextResponse.json({ error: "Query timeout - please try again" }, { status: 408 });
      }

      if (error.message.includes("MongoServerError")) {
        return NextResponse.json({ error: "Database connection error" }, { status: 503 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query parameters", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
