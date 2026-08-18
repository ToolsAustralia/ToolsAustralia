import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { distinctOrderCategories, listOrders } from "@/services/shop/orderQueries";

/**
 * Admin order list.
 *
 * Same service as the customer's own history (`/api/orders`), with one difference:
 * no `userId`, so it spans every customer. That asymmetry is the whole security
 * boundary here, which is why it is stated rather than implied — see
 * `orderQueries.listOrders`.
 *
 * `categories` is returned alongside the rows so the filter offers exactly what the
 * data contains ("Apparel" today, tools too if they are ever stocked) rather than a
 * hard-coded list that can offer a filter matching nothing.
 */

const querySchema = z.object({
  status: z
    .enum(["pending", "processing", "shipped", "delivered", "cancelled", "completed"])
    .optional(),
  category: z.string().trim().min(1).max(64).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const guard = await requirePermission("shop.view");
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const filters = querySchema.parse(params);

    const [result, categories] = await Promise.all([
      listOrders(filters),
      distinctOrderCategories(),
    ]);

    return NextResponse.json(
      { ...result, categories },
      // Customer names and order values — never cached at the edge.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid filters", details: error.issues }, { status: 400 });
    }
    console.error("[shop] admin order list failed:", error);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
