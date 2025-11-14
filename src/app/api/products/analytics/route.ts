import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30"; // days
    const days = parseInt(period);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get product analytics
    const analytics = await Product.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          averagePrice: { $avg: "$price" },
          totalValue: { $sum: "$price" },
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: "$reviewCount" },
          lowStockProducts: {
            $sum: {
              $cond: [{ $lte: ["$stock", 10] }, 1, 0],
            },
          },
          outOfStockProducts: {
            $sum: {
              $cond: [{ $eq: ["$stock", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    // Get top categories
    const topCategories = await Product.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          averagePrice: { $avg: "$price" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get top brands
    const topBrands = await Product.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$brand",
          count: { $sum: 1 },
          averagePrice: { $avg: "$price" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get price distribution
    const priceDistribution = await Product.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
          default: "10000+",
          output: {
            count: { $sum: 1 },
            averagePrice: { $avg: "$price" },
          },
        },
      },
    ]);

    return NextResponse.json({
      period: `${days} days`,
      summary: analytics[0] || {
        totalProducts: 0,
        averagePrice: 0,
        totalValue: 0,
        averageRating: 0,
        totalReviews: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
      },
      topCategories,
      topBrands,
      priceDistribution,
    });
  } catch (error) {
    console.error("Error fetching product analytics:", error);
    return NextResponse.json({ error: "Failed to fetch product analytics" }, { status: 500 });
  }
}

