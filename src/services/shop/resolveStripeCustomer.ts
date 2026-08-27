import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";

/**
 * Resolve a usable Stripe customer for a shop purchase.
 *
 * A stored `stripeCustomerId` cannot be trusted to still exist. Customers are
 * deleted in the Stripe dashboard, test and live data diverge, and seeded
 * fixtures carry placeholders — in all of those cases passing the stale id
 * straight to `paymentIntents.create` throws `No such customer` and the customer
 * sees a 500 at checkout with no way forward.
 *
 * So: try the stored id, fall back to a lookup by email, and create one only if
 * neither works. The resolved id is written back so the next purchase is a
 * single API call.
 *
 * Adapted from `createShopPurchasePaymentIntent.service.ts` on the unmerged
 * `claude/shop-setup` branch, which had this right.
 */
export async function resolveStripeCustomerId(user: {
  _id: unknown;
  email: string;
  firstName?: string;
  lastName?: string;
  stripeCustomerId?: string | null;
}): Promise<string> {
  // 1. The stored id, if it still resolves.
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!("deleted" in existing && existing.deleted)) {
        return existing.id;
      }
    } catch {
      // Unknown or deleted customer — fall through and re-resolve rather than
      // failing the purchase.
    }
  }

  // 2. An existing customer with this email (covers a re-created account, or a
  //    customer made by another flow before this user record had the id).
  const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
  const found = byEmail.data[0] as Stripe.Customer | undefined;
  if (found && !found.deleted) {
    await persist(user._id, found.id);
    return found.id;
  }

  // 3. Create.
  const created = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { source: "shop", userId: String(user._id) },
  });
  await persist(user._id, created.id);
  return created.id;
}

async function persist(userId: unknown, stripeCustomerId: string): Promise<void> {
  // Best-effort: a failure here costs one extra Stripe lookup next time, and
  // must never fail a purchase that is otherwise fine.
  await User.updateOne({ _id: userId }, { stripeCustomerId }).catch((err) =>
    console.error("[shop] could not persist resolved stripeCustomerId", { userId, err })
  );
}
