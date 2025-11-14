import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().min(1).max(500),
  userName: z.string().min(1).max(100),
  userEmail: z.string().email(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);

    const product = await Product.findById(id).lean();
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Type assertion to handle the lean() return type
    const productData = product as Record<string, unknown>;

    return NextResponse.json({
      reviews: productData.reviews || [],
      averageRating: productData.rating || 0,
      totalReviews: productData.reviewCount || 0,
    });
  } catch (error) {
    console.error("Error fetching product reviews:", error);
    return NextResponse.json({ error: "Failed to fetch product reviews" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = reviewSchema.parse(body);

    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Add new review
    const newReview = {
      rating: validatedData.rating,
      comment: validatedData.comment,
      userName: validatedData.userName,
      userEmail: validatedData.userEmail,
      createdAt: new Date(),
    };

    product.reviews = product.reviews || [];
    product.reviews.push(newReview);

    // Recalculate average rating and review count
    const totalRating = product.reviews.reduce(
      (sum: number, review: Record<string, unknown>) => sum + (review.rating as number),
      0
    );
    product.rating = totalRating / product.reviews.length;
    product.reviewCount = product.reviews.length;

    await product.save();

    return NextResponse.json({
      message: "Review added successfully",
      review: newReview,
      averageRating: product.rating,
      totalReviews: product.reviewCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error adding product review:", error);
    return NextResponse.json({ error: "Failed to add product review" }, { status: 500 });
  }
}
