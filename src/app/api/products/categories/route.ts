import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

// Next.js ISR configuration
export const revalidate = 300; // Revalidate every 5 minutes (categories change less frequently)

export async function GET() {
  try {
    await connectDB();

    // Get all unique categories with product counts
    const categories = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get all unique brands with product counts
    const brands = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$brand",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get price range
    const priceRange = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
        },
      },
    ]);

    return NextResponse.json(
      {
        categories: categories.map((cat) => ({
          name: cat._id,
          count: cat.count,
        })),
        brands: brands.map((brand) => ({
          name: brand._id,
          count: brand.count,
        })),
        priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", // Cache 5min, serve stale up to 10min
        },
      }
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
