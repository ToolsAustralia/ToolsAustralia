import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { listOrders } from "@/services/shop/orderQueries";

/**
 * The signed-in customer's own order history.
 *
 * Shares listOrders with the admin list; the ONLY difference is that userId is
 * pinned to the session here, which is the entire security boundary. It is read
 * from the session and never from a query parameter.
 *
 * Previously this did an unprojected .find().populate("products.product"), which
 * shipped every full Product document plus every address on every order — the
 * exact unprojected-list footgun CLAUDE.md documents. The shared service projects
 * an explicit include-list instead.
 */
/**
 * A customer listing their own orders. READ ONLY, deliberately.
 *
 * There was a POST here that built an Order straight from a request body. It
 * took paymentIntentId from the caller, DECREMENTED PRODUCT STOCK, and emptied
 * the cart -- all before any money moved, and authorised by nothing more than
 * being signed in. The order landed `status: "pending"` so it could not reach
 * the fulfilment queue, but a signed-in customer could still drain stock on
 * every tracked-inventory product from a console, and stamp orders with an
 * arbitrary payment id.
 *
 * Nothing reached it: useCreateOrder is exported from the hook barrel and
 * called by no component. Shop orders are created by POST /api/shop/checkout,
 * which prices the cart server-side, and only the Stripe webhook marks one
 * paid.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const params = request.nextUrl.searchParams;
    const result = await listOrders({
      userId: String(user._id),
      page: Number(params.get("page")) || 1,
      limit: Math.min(50, Number(params.get("limit")) || 20),
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
