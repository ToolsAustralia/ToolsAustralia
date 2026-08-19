import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { refundShopOrder } from "@/services/shop/refundShopOrder";

/**
 * Refund a merchandise order.
 *
 * Its own route rather than another branch of the orders PATCH: a refund moves real
 * money and is not reversible, so it gets its own permission, its own audit row and
 * its own request shape. Bundling it into the tracking-number endpoint would mean one
 * malformed body could refund an order.
 *
 * `shop.delete` rather than `shop.edit` — this is the most destructive action in the
 * shop surface, and a staff member who may correct a tracking number is not
 * automatically someone who may hand money back.
 */

const bodySchema = z.object({
  orderId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Not a valid order id"),
  /** Cents. Omit for a full refund. */
  amountCents: z.number().int().positive().max(10_000_00).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Which failures are the caller's fault and which are ours. */
const STATUS_CODE: Record<string, number> = {
  order_not_found: 404,
  not_refundable: 409,
  already_refunded: 409,
  no_payment: 409,
  stripe_failed: 502,
  // The money moved but our record did not: a 502 so the caller treats it as the
  // failure it is, and staff go and look at the order.
  local_write_failed: 502,
};

export async function POST(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.delete", request, {
    resourceType: "Order",
  });
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    await connectDB();
    const result = await refundShopOrder({
      orderId: parsed.data.orderId,
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason,
      actorId: guard.session.user?.id,
    });

    if (result.status !== "refunded") {
      const code = STATUS_CODE[result.status] ?? 400;
      await guard.log(code);
      return NextResponse.json(
        { success: false, error: result.error ?? result.status, status: result.status },
        { status: code }
      );
    }

    await guard.log(200);
    return NextResponse.json({
      success: true,
      data: {
        orderNumber: result.orderNumber,
        amountRefunded: result.amountRefunded,
        wasFull: result.wasFull,
      },
    });
  } catch (error) {
    console.error("[admin] shop refund failed", error);
    await guard.log(500);
    return NextResponse.json({ success: false, error: "Refund failed" }, { status: 500 });
  }
}
