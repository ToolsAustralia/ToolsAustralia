import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const category = searchParams.get("category") || undefined;
    const brand = searchParams.get("brand") || undefined;
    const isActive = searchParams.get("isActive") || undefined;

    // Build query
    const query: Record<string, unknown> = {};
    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const products = await Product.find(query).lean();

    if (format === "csv") {
      // Convert to CSV format
      const csvHeaders = [
        "ID",
        "Name",
        "Description",
        "Price",
        "Original Price",
        "Category",
        "Brand",
        "Stock",
        "Rating",
        "Review Count",
        "Is Active",
        "Is Featured",
        "Created At",
      ];

      const csvRows = products.map((product) => [
        product._id,
        product.name,
        product.description,
        product.price,
        product.originalPrice || "",
        product.category,
        product.brand,
        product.stock,
        product.rating || 0,
        product.reviewCount || 0,
        product.isActive,
        product.isFeatured,
        product.createdAt,
      ]);

      const csvContent = [
        csvHeaders.join(","),
        ...csvRows.map((row) => row.map((field) => `"${field}"`).join(",")),
      ].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="products.csv"',
        },
      });
    } else {
      // Return JSON format
      return NextResponse.json({
        products,
        total: products.length,
        exportedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error exporting products:", error);
    return NextResponse.json({ error: "Failed to export products" }, { status: 500 });
  }
}
