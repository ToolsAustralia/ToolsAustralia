import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

const paramsSchema = z.object({
  id: z.string().min(1),
});

// Identity is taken from the session, never the body. This route previously
// accepted `userName` / `userEmail` from the caller, which let an anonymous
// request post a review under anyone's name on a public page.
const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().min(1).max(500),
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
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const { id } = paramsSchema.parse(await params);
    const body = await request.json();
    const validatedData = reviewSchema.parse(body);

    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Add new review. `userId` is required by the schema — writing the review
    // without it (as this route used to) fails Mongoose validation.
    const newReview = {
      userId: user._id,
      rating: validatedData.rating,
      comment: validatedData.comment,
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

    await product.save();

    // `reviewCount` is not a field on the Product schema — assigning it was a
    // silent no-op under strict mode and the response returned undefined.
    return NextResponse.json({
      message: "Review added successfully",
      review: newReview,
      averageRating: product.rating,
      totalReviews: product.reviews.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error adding product review:", error);
    return NextResponse.json({ error: "Failed to add product review" }, { status: 500 });
  }
}
