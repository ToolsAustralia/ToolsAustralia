// scripts/e2e-stripe-helpers.ts
//
// Idempotent helpers to create the Stripe-side state the E2E seed needs.
// Every customer gets metadata.e2e=true so cleanup can find and delete them.

import { stripe } from "@/lib/stripe";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";

const PRICE_BY_PACKAGE: Record<string, string | undefined> = {
  "tradie-subscription":  process.env.STRIPE_PRICE_ID_TRADIE,
  "foreman-subscription": process.env.STRIPE_PRICE_ID_FOREMAN,
  "boss-subscription":    process.env.STRIPE_PRICE_ID_BOSS,
};

export function priceForPackage(packageId: string): string {
  const price = PRICE_BY_PACKAGE[packageId];
  if (!price) {
    throw new Error(
      `Missing Stripe price ID for package "${packageId}". ` +
      `Set STRIPE_PRICE_ID_TRADIE/FOREMAN/BOSS in .env.local.`,
    );
  }
  return price;
}

/**
 * Create (or reuse) a Stripe customer for an E2E test user.
 * Idempotent by email + metadata.e2e — if a customer with this email
 * and metadata.e2e=true exists, it is returned unchanged.
 */
export async function ensureE2ECustomer(args: {
  email: string;
  name: string;
  role: string;
}): Promise<{ customerId: string }> {
  const existing = await stripe.customers.list({ email: args.email, limit: 1 });
  if (existing.data[0]?.metadata?.e2e === "true") {
    return { customerId: existing.data[0].id };
  }
  const customer = await stripe.customers.create({
    email: args.email,
    name: args.name,
    metadata: { e2e: "true", role: args.role },
  });
  return { customerId: customer.id };
}

/**
 * Attach Stripe's pre-tokenised test card to a customer and set it as the
 * default for invoices and subscriptions. Avoids needing the PaymentElement
 * UI during seeding.
 */
export async function attachTestPaymentMethod(customerId: string): Promise<void> {
  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
}

/**
 * Create an active subscription for the customer on the given package's price.
 * The first invoice settles immediately because the default PM is set.
 */
export async function ensureE2ESubscription(args: {
  customerId: string;
  packageId: string;
}): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
  const sub = await stripe.subscriptions.create({
    customer: args.customerId,
    items: [{ price: priceForPackage(args.packageId) }],
    metadata: { e2e: "true", packageId: args.packageId },
    expand: ["latest_invoice.payment_intent", "items.data"],
  });
  const periodEnd = getSubscriptionPeriodEnd(sub);
  if (typeof periodEnd !== "number") {
    throw new Error(
      `ensureE2ESubscription: unable to read current_period_end for ${sub.id}`,
    );
  }
  return {
    subscriptionId: sub.id,
    currentPeriodEnd: new Date(periodEnd * 1000),
  };
}

/**
 * List all e2e customers (metadata.e2e=true). Paginates Stripe results.
 */
export async function listE2ECustomers(): Promise<string[]> {
  const ids: string[] = [];
  let starting_after: string | undefined;
  while (true) {
    const page: Awaited<ReturnType<typeof stripe.customers.list>> = await stripe.customers.list({
      limit: 100,
      starting_after,
    });
    for (const c of page.data) {
      if (c.metadata?.e2e === "true") ids.push(c.id);
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return ids;
}

/**
 * Delete a Stripe customer (cascades subscriptions, invoices, PIs Stripe-side).
 * Tolerates already-deleted state.
 */
export async function deleteE2ECustomer(customerId: string): Promise<void> {
  try {
    await stripe.customers.del(customerId);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "resource_missing") return;
    throw err;
  }
}
