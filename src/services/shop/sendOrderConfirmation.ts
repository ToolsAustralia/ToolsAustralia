import type { IOrder } from "@/models/Order";
import User from "@/models/User";
import { sendCustomEmail } from "@/lib/email";
import { createShopOrderConfirmationTemplate } from "@/lib/email/templates";

/**
 * The receipt for a paid merchandise order.
 *
 * Sent from the webhook, once the money has actually settled — never from the
 * checkout page, which a customer can close before the payment confirms.
 *
 * Best-effort by contract: the caller catches, and this never throws. An SMTP
 * outage must not fail the webhook, because failing it retries the ENTIRE
 * fulfilment (stock, cart clear, entry grant), and a customer would rather have a
 * missing email than a double-printed garment.
 */

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;

/** "6A Aylesbury Crescent, Gladstone Park VIC 3043" — one readable line. */
function formatAddress(order: IOrder): string {
  const a = order.shippingAddress ?? {};
  const street = [a.addressLine1, a.addressLine2].filter(Boolean).join(", ");
  const locality = [a.city, a.state, a.postalCode].filter(Boolean).join(" ");
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
  return [name, street, locality, a.country ?? "Australia"].filter(Boolean).join("\n");
}

export async function sendShopOrderConfirmation(order: IOrder): Promise<void> {
  // The address the customer typed at checkout is the best address we hold — they
  // may have entered a different one from their account email. Fall back to the
  // account only when checkout captured none.
  let to = order.shippingAddress?.email?.trim();
  let firstName = order.shippingAddress?.firstName?.trim() ?? "";

  if (!to || !firstName) {
    const user = await User.findById(order.user).select("email firstName").lean<{
      email?: string;
      firstName?: string;
    } | null>();
    to = to || user?.email;
    firstName = firstName || user?.firstName || "";
  }

  if (!to) {
    // Loud, because a paid customer receiving nothing is a support ticket that
    // starts with "I never got a confirmation".
    console.error("[shop] no email address for a paid order — confirmation not sent", {
      orderNumber: order.orderNumber,
    });
    return;
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  const discount = (order.appliedDiscounts ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0);

  const html = createShopOrderConfirmationTemplate({
    firstName,
    orderNumber: order.orderNumber,
    items: order.products.map((line) => ({
      name: line.name ?? "Item",
      // Snapshotted on the line at checkout, so this needs no lookup and stays
      // correct even if the variant is later removed from the catalogue. Falls back
      // to the sku for orders placed before those fields existed.
      variant: [line.colour, line.size].filter(Boolean).join(" · ") || line.sku,
      quantity: line.quantity,
      lineTotal: money((line.price ?? 0) * line.quantity),
    })),
    subtotal: money(order.subtotal),
    discount: discount > 0 ? `-${money(discount)}` : undefined,
    // "Free" reads better than "$0.00" and matches the threshold copy on the shop.
    shipping: (order.shippingCost ?? 0) > 0 ? money(order.shippingCost) : "Free",
    total: money(order.totalAmount),
    gst: money(order.gstAmount),
    // Only rendered when > 0. While merchandise entries are switched off pending
    // the permit, this is 0 and the block is omitted entirely rather than promising
    // "0 free entries".
    freeEntries: order.entriesGranted,
    shippingAddress: formatAddress(order),
    orderUrl: `${baseUrl}/checkout/success?orderId=${String(order._id)}`,
  });

  const result = await sendCustomEmail({
    to,
    subject: `Order confirmed — ${order.orderNumber}`,
    html,
  });

  if (!result.success) {
    console.error("[shop] order confirmation email was not accepted by the mail server", {
      orderNumber: order.orderNumber,
      error: result.error,
    });
  }
}
