import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order, { type IOrder } from "@/models/Order";
import { authOptions } from "@/lib/auth";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { displayableReviews, displayAverage } from "@/utils/shop/reviews";

// GET now varies per viewer (`reviewEligibility` is derived from the session), so
// this response must never be served from a shared cache.
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  // An ObjectId, not any non-empty string: `Product.findById("not-an-id")` throws
  // a CastError, which this route used to surface as a 500 for what is a
  // malformed URL and belongs in the 400 family.
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid product id"),
});

// Identity is taken from the session, never the body. This route previously
// accepted `userName` / `userEmail` from the caller, which let an anonymous
// request post a review under anyone's name on a public page.
const reviewSchema = z.object({
  // `.int()` matters: without it a caller could post 4.7 stars and drag the
  // average with a value no star control can produce.
  rating: z.number().int().min(1).max(5),
  // Optional, because a star rating on its own is a complete review. The 500 cap
  // mirrors the `maxlength` on the Product reviews sub-schema.
  comment: z.string().trim().max(500).optional(),
});

/** What the reviews sub-schema on models/Product.ts actually stores. */
interface StoredReview {
  userId?: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt?: Date;
}

/**
 * Whether the signed-in viewer may post a review, and if not, why not.
 *
 * Three outcomes rather than a boolean because each one needs different words on
 * the page: a buyer who has already reviewed must be told their review was kept,
 * not shown an empty form again.
 */
type ReviewEligibility = "eligible" | "already_reviewed" | "not_eligible";

/**
 * Order statuses that mean the customer's money was actually taken.
 *
 * `pending` is an order created before payment (ShopOrderService.createPendingOrder)
 * and `cancelled` is what a full refund writes (refundShopOrder.ts), so neither one
 * buys the right to review. The remaining four are the same set refundShopOrder.ts
 * calls REFUNDABLE — by definition, the orders there is money to give back on.
 */
const PAID_ORDER_STATUSES: readonly IOrder["status"][] = [
  "processing",
  "shipped",
  "delivered",
  "completed",
];

/**
 * The entitlement gate: has this user paid for this product?
 *
 * Checked against the order's own snapshot of what was bought, so a product later
 * deactivated or recategorised does not retroactively strip a real buyer of the
 * right to review what they own.
 */
async function hasPaidOrderFor(userId: string, productId: string): Promise<boolean> {
  const paidOrder = await Order.exists({
    user: userId,
    status: { $in: PAID_ORDER_STATUSES },
    "products.product": productId,
  });
  return paidOrder !== null;
}

async function resolveEligibility(
  productId: string,
  reviews: StoredReview[]
): Promise<ReviewEligibility> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return "not_eligible";

  if (reviews.some((review) => String(review.userId) === userId)) return "already_reviewed";

  return (await hasPaidOrderFor(userId, productId)) ? "eligible" : "not_eligible";
}

/** Reviews are public; the reviewer's user id is not. Only these three fields ship. */
function toPublicReview(review: StoredReview) {
  return { rating: review.rating, comment: review.comment, createdAt: review.createdAt };
}

/** One decimal place, so the page shows "4.3" rather than "4.333333333333333". */
function averageRating(reviews: StoredReview[]): number {
  if (reviews.length === 0) return 0;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);

    const product = await Product.findById(id)
      .select("rating reviews")
      .lean<{ rating?: number; reviews?: StoredReview[] } | null>();
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    const reviews = product.reviews ?? [];

    return NextResponse.json({
      reviews: reviews.map(toPublicReview),
      averageRating: product.rating ?? 0,
      // Was `productData.reviewCount`, a field that has never existed on the
      // Product schema — so this counter read 0 no matter how many reviews existed.
      totalReviews: reviews.length,
      reviewEligibility: await resolveEligibility(id, reviews),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error fetching product reviews:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch product reviews" },
      { status: 500 }
    );
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

    const product = await Product.findById(id).select("_id").lean();
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    // Authorisation, not decoration. The form is hidden from anyone who cannot use
    // it, but hiding a control is presentation — a POST straight at this route is
    // what actually has to be refused, and this is where that happens.
    if (!(await hasPaidOrderFor(String(user._id), id))) {
      return NextResponse.json(
        { success: false, error: "Only a customer who has bought this item can review it." },
        { status: 403 }
      );
    }

    // Built rather than cast: models/User.ts declares `_id` as a string, so it has
    // to be turned back into the ObjectId the reviews sub-schema requires.
    const reviewerId = new mongoose.Types.ObjectId(String(user._id));

    // `userId` is required by the schema — writing the review without it (as this
    // route used to) fails Mongoose validation. There is no name field on the
    // sub-schema and nothing here invents one.
    const newReview: StoredReview = {
      userId: reviewerId,
      rating: validatedData.rating,
      createdAt: new Date(),
    };
    if (validatedData.comment) newReview.comment = validatedData.comment;

    // `reviews.userId: { $ne }` in the FILTER is the one-review-per-buyer guard, and
    // it has to live there rather than in a preceding read: two submissions racing
    // each other would both pass a read-then-write check and both be written.
    const updated = await Product.findOneAndUpdate(
      { _id: id, "reviews.userId": { $ne: reviewerId } },
      { $push: { reviews: newReview } },
      { new: true }
    )
      .select("reviews")
      .lean<{ reviews?: StoredReview[] } | null>();

    if (!updated) {
      // The product exists — checked above — so the only clause left to fail is the
      // duplicate guard.
      return NextResponse.json(
        { success: false, error: "You have already reviewed this item." },
        { status: 409 }
      );
    }

    const reviews = updated.reviews ?? [];
    // Recomputed from the array the write returned — the reviews actually stored,
    // post-push — rather than adjusted from the previous average or from a counter.
    // A counter is what `reviewCount` was, and it drifted to permanently reading 0.
    // Two reviews landing in the same instant can leave this average one write
    // behind; the next review recomputes it from the full array either way.
    const rating = averageRating(reviews);
    // reviewCount rides the SAME recompute rather than being incremented, so it
    // cannot drift out of step with the average the way the old counter did.
    // Both pairs from the same array in the same write, so the figures a customer
    // sees and the figures staff see can never drift apart.
    const shown = displayableReviews(reviews);
    await Product.updateOne(
      { _id: id },
      {
        $set: {
          rating,
          reviewCount: reviews.length,
          displayRating: displayAverage(shown),
          displayReviewCount: shown.length,
        },
      }
    );

    return NextResponse.json({
      message: "Review added successfully",
      review: toPublicReview(newReview),
      averageRating: rating,
      totalReviews: reviews.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error adding product review:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add product review" },
      { status: 500 }
    );
  }
}
