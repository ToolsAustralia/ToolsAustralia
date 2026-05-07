// src/services/shop/createShopPurchasePaymentIntent.service.ts
//
// TODO(shared-payment-extraction): This is a deliberate duplicate of payment-intent
// plumbing from src/app/api/stripe/create-one-time-purchase/route.ts. The duplication
// is intentional for safe ship; extraction into a shared service is deferred until
// shop has been live for ≥2 weeks and we have signal on what stays the same vs diverges.
// See docs/superpowers/specs/2026-05-04-shop-feature-mvp-design.md §4.3.

import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";

export interface ShopPaymentIntentInput {
  amountCents: number;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  existingUserId?: string;
  paymentMethodId?: string; // optional — if not provided, PaymentElement will provide on confirmPayment
  idempotencyKey: string;
  description: string;
  metadata: Record<string, string>;
}

export interface ShopPaymentIntentResult {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
}

async function resolveOrCreateCustomer(input: ShopPaymentIntentInput): Promise<Stripe.Customer> {
  // Logged-in user with stripeCustomerId
  if (input.existingUserId) {
    const user = await User.findById(input.existingUserId).lean();
    if (user?.stripeCustomerId) {
      const retrieved = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!("deleted" in retrieved && retrieved.deleted)) {
        return retrieved as Stripe.Customer;
      }
      // Deleted — fall through to create
    }
  }

  // Try to find Stripe customer by email (handles guest → returning customer)
  const list = await stripe.customers.list({ email: input.customerEmail, limit: 1 });
  if (list.data[0] && !("deleted" in list.data[0] && list.data[0].deleted)) {
    return list.data[0];
  }

  // Create new
  return await stripe.customers.create({
    email: input.customerEmail,
    name: `${input.customerFirstName} ${input.customerLastName}`,
    phone: input.customerPhone,
    metadata: {
      source: "shop",
      ...(input.existingUserId ? { userId: input.existingUserId } : { type: "guest" }),
    },
  });
}

export async function createShopPurchasePaymentIntent(
  input: ShopPaymentIntentInput,
): Promise<ShopPaymentIntentResult> {
  const customer = await resolveOrCreateCustomer(input);

  // If user provided a payment method, attach it to the customer (idempotent)
  if (input.paymentMethodId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
      if (pm.customer !== customer.id) {
        await stripe.paymentMethods.attach(input.paymentMethodId, { customer: customer.id });
      }
    } catch (err) {
      console.error("[shop] failed to attach payment method", err);
      // Non-fatal: PaymentElement will handle on confirmPayment
    }
  }

  const config = createPaymentIntentConfig({
    amount: input.amountCents,
    currency: "aud",
    customer: customer.id,
    paymentMethod: input.paymentMethodId,
    confirm: false, // PaymentElement confirms on the client
    paymentType: "shop",
    description: input.description,
    setupFutureUsage: "off_session",
    metadata: input.metadata,
  });

  const paymentIntent = await stripe.paymentIntents.create(config, {
    idempotencyKey: input.idempotencyKey,
  });

  return { paymentIntent, customerId: customer.id };
}
