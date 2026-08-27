import Order, { type IOrder } from "@/models/Order";
import User from "@/models/User";
import { emailService } from "@/lib/email/";
import { createShopOrderShippedTemplate } from "@/lib/email/templates";

/**
 * The dispatch notice for a merchandise order.
 *
 * Sent from `updateOrderFulfilment` the one time an order crosses into `shipped`.
 * Until this existed the confirmation email could not promise a second one, so that
 * promise was cut from it; this is what lets it be made again truthfully.
 *
 * Takes an id rather than an `IOrder` — unlike the confirmation, whose caller has
 * just built the order in memory, the fulfilment write holds only a two-field
 * projection. Loading here also means the email describes what is actually
 * committed, never what a caller hoped it wrote.
 *
 * Best-effort by contract: this NEVER throws, and swallows its own failures rather
 * than relying on the caller to. Its caller is a database write that has already
 * succeeded — letting a mail problem escape would hand the admin "Failed to update
 * the order" for an order that did update, and the retry would mark it shipped a
 * second time. A missing email beats a customer getting two.
 */

/** "Dave Smith\n12 Anzac Pde, Kensington NSW 2033\nAustralia" — one readable block. */
function formatAddress(order: IOrder): string {
  // Twin of the formatter in sendOrderConfirmation.ts. Kept local on purpose: the
  // two emails are free to diverge on what they show of an address, and neither
  // file is the natural owner of a shared one.
  const a = order.shippingAddress ?? {};
  const street = [a.addressLine1, a.addressLine2].filter(Boolean).join(", ");
  const locality = [a.city, a.state, a.postalCode].filter(Boolean).join(" ");
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
  return [name, street, locality, a.country ?? "Australia"].filter(Boolean).join("\n");
}

export async function sendShopOrderShipped(orderId: string): Promise<void> {
  try {
    // Explicit include-list, per the projection discipline in CLAUDE.md — an
    // unprojected find on this collection ships every line and address it holds.
    const order = await Order.findById(orderId)
      .select(
        "orderNumber user trackingNumber products.name products.sku products.size products.colour products.quantity shippingAddress"
      )
      .lean<IOrder | null>();

    if (!order) {
      console.error("[shop] order disappeared between the fulfilment write and the dispatch email", {
        orderId,
      });
      return;
    }

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
      // Loud, because the customer is now waiting on a parcel nobody told them about.
      console.error("[shop] no email address for a shipped order — dispatch notice not sent", {
        orderNumber: order.orderNumber,
      });
      return;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

    const html = createShopOrderShippedTemplate({
      firstName,
      orderNumber: order.orderNumber,
      items: (order.products ?? []).map((line) => ({
        name: line.name ?? "Item",
        // Snapshotted on the line at checkout, so this needs no lookup and stays
        // correct even if the variant is later removed from the catalogue. Falls
        // back to the sku for orders placed before those fields existed.
        variant: [line.colour, line.size].filter(Boolean).join(" · ") || line.sku,
        quantity: line.quantity,
      })),
      // Optional: an order can reach "shipped" on a status change alone, and the
      // template drops the row rather than showing an empty one.
      trackingNumber: order.trackingNumber,
      shippingAddress: formatAddress(order),
      orderUrl: `${baseUrl}/my-account/orders`,
    });

    // emailService, NOT the sendCustomEmail in @/lib/email. That one is the
    // deprecated SMTP path whose transporter is hard-coded `return null`, so every
    // call fails silently into a console.error nobody reads.
    const result = await emailService.sendCustomEmail({
      to,
      subject: `Your order is on its way — ${order.orderNumber}`,
      html,
    });

    if (!result.success) {
      console.error("[shop] dispatch notice was not accepted by the mail server", {
        orderNumber: order.orderNumber,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("[shop] dispatch notice failed", { orderId, err });
  }
}
