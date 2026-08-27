import type { IOrder } from "@/models/Order";
import User from "@/models/User";
import { emailService } from "@/lib/email/";
import { createShopOrderRefundedTemplate } from "@/lib/email/templates";
import { getContactEmail } from "@/lib/email/sender-identities";

/**
 * Tell a customer their merchandise order was cancelled and refunded.
 *
 * WHY THIS EXISTS: stock is taken AFTER payment, because a print-to-order catalogue
 * mostly has none to take. "Paid, but we cannot supply it" is therefore a real
 * branch — `finalizeShopOrder` refunds and marks the order `cancelled`. Until this,
 * that branch sent NOTHING: the customer paid, watched the money leave, and heard
 * nothing. A staff-initiated refund was equally silent.
 *
 * Best-effort by contract, exactly like the confirmation: the caller catches and
 * this never throws. An SMTP outage must not fail the webhook, because failing it
 * retries the whole fulfilment — and this branch has already moved money.
 */

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;

export async function sendShopOrderRefunded(order: IOrder, reason: string): Promise<void> {
  // Same recipient rule as the confirmation: the address typed at checkout is the
  // best one we hold, with the account email as the fallback.
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
    // Loud: a customer whose money moved and who was told nothing is the worst
    // version of this failure.
    console.error("[shop] no email address for a refunded order — customer not told", {
      orderNumber: order.orderNumber,
    });
    return;
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  const html = createShopOrderRefundedTemplate({
    firstName,
    orderNumber: order.orderNumber,
    items: order.products.map((line) => ({
      name: line.name ?? "Item",
      variant: [line.colour, line.size].filter(Boolean).join(" · ") || line.sku,
      quantity: line.quantity,
    })),
    // The full order total. Both refund paths in this codebase are full refunds —
    // the stock-loss auto-refund and the admin refund tool — so quoting the total is
    // accurate. A partial-refund path would have to pass its own figure.
    refundAmount: money(order.totalAmount),
    reason,
    orderUrl: `${baseUrl}/my-account/orders`,
    supportEmail: getContactEmail(),
  });

  const result = await emailService.sendCustomEmail({
    to,
    subject: `Order cancelled and refunded — ${order.orderNumber}`,
    html,
  });

  if (!result.success) {
    console.error("[shop] refund email was not accepted by the mail server", {
      orderNumber: order.orderNumber,
      error: result.error,
    });
  }
}
