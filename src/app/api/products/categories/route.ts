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

    // Variant facets. Apparel is chosen by size and colour, so these are the two
    // things a merchandise shopper actually filters by — and unlike the hard-coded
    // "Tool Style" list they used to sit beside, every value here is one a product
    // genuinely has. Only ACTIVE variants count: an inactive size must not be
    // offered as a filter that returns nothing.
    const variantFacet = (field: "size" | "colour") =>
      Product.aggregate([
        { $match: { isActive: true } },
        { $unwind: "$variants" },
        { $match: { "variants.isActive": { $ne: false }, [`variants.${field}`]: { $nin: [null, ""] } } },
        { $group: { _id: `$variants.${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

    const [sizes, colours] = await Promise.all([variantFacet("size"), variantFacet("colour")]);

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
        // Sizes sort by GARMENT ORDER, not by popularity. Frequency ordering put a
        // rail in front of customers reading "S, M, L, XS, XL", which reads as broken
        // even though every value is correct. Anything unrecognised (a numeric or
        // one-off size) keeps its frequency position at the end.
        sizes: [...sizes]
          .map((v) => ({ name: v._id as string, count: v.count as number }))
          .sort((a, b) => {
            const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
            const ia = order.indexOf(a.name.toUpperCase());
            const ib = order.indexOf(b.name.toUpperCase());
            if (ia === -1 && ib === -1) return b.count - a.count;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          }),
        colours: colours.map((v) => ({ name: v._id as string, count: v.count as number })),
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
