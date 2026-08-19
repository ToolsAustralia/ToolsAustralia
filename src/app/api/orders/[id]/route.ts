import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";

// A Mongo ObjectId, not any non-empty string. `Order.findOne({_id: "ORD-2024-001"})`
// throws a CastError, which surfaced as a 500 — the checkout success page's
// placeholder id did exactly that. A malformed id is a 404, not a server fault.
const paramsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Not a valid order id"),
});

/**
 * A customer reading one of their own orders. READ ONLY, deliberately.
 *
 * There was a PUT here that accepted `status`, `trackingNumber` and `notes`
 * from the request body, authorised by nothing more than "you own this order".
 * A signed-in customer could therefore PUT their own unpaid order from
 * `pending` to `processing` — which is exactly what the fulfilment queue
 * selects on (services/shop/fulfilmentExport.ts pendingFilter) — and have a
 * garment printed and posted without paying for it. It would also have
 * desynced the Stripe webhook, whose markPaid matches on status `pending`.
 *
 * Nothing in the app called it: the order hooks point at /cancel and /status,
 * neither of which exists. Order status belongs to the webhook and to staff,
 * never to the buyer, so the handler is gone rather than patched.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const auth = await requireAuthenticatedUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    const userId = auth.session.user.id;

    // Projected, and the populate narrowed.
    //
    // This returned the raw Order plus a FULLY populated Product, so a buyer
    // received `notes` -- which is where staff refund reasons are written -- and
    // the print-ready artwork for everything they had ordered. `notes` is internal;
    // the product join only needs enough to render a line.
    const order = await Order.findOne({ _id: id, user: userId })
      .select("-notes")
      .populate("products.product", "name images brand category")
      .lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    // A malformed id is the caller's problem, not a server fault. Returning 500
    // here made the success page's placeholder id look like an outage, and the
    // e2e QA watchdog rightly failed the run on it.
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}
