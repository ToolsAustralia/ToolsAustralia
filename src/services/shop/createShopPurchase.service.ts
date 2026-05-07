// src/services/shop/createShopPurchase.service.ts
import Stripe from "stripe";
import { BUSINESS } from "@/config/business";
import { validateCart } from "./cartValidation.service";
import { computeShopTotals } from "./shopTotals.service";
import { createShopPurchasePaymentIntent } from "./createShopPurchasePaymentIntent.service";

export interface ShippingAddressInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  deliveryInstructions?: string;
}

export interface CreateShopPurchaseInput {
  items: { productId: string; quantity: number }[];
  shippingAddress: ShippingAddressInput;
  paymentMethodId?: string;
  idempotencyKey?: string;
  user?: { _id: string; email: string; firstName?: string; lastName?: string } | null;
  capiContext?: {
    ip?: string;
    userAgent?: string;
    fbc?: string;
    fbp?: string;
    eventSourceUrl?: string;
  };
}

export interface CreateShopPurchaseResult {
  ok: true;
  paymentIntentId: string;
  clientSecret: string;
  customerId: string;
  status: Stripe.PaymentIntent.Status;
}
export interface CreateShopPurchaseError {
  ok: false;
  errors: { productId: string; reason: string; message: string }[];
}

export async function createShopPurchase(
  input: CreateShopPurchaseInput,
): Promise<CreateShopPurchaseResult | CreateShopPurchaseError> {
  // 1. Validate cart server-side
  const validation = await validateCart({
    items: input.items,
    userContext: { isMember: false }, // extension point
  });
  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors };
  }

  // 2. Compute totals
  const totals = computeShopTotals({
    items: validation.validatedItems,
    freeShippingThresholdCents: BUSINESS.shop.freeShippingThreshold * 100,
    flatShippingRateCents: BUSINESS.shop.flatShippingRate * 100,
  });

  // 3. Build PI metadata
  const idempotencyKey =
    input.idempotencyKey ??
    `pi_shop_${input.user?._id ?? input.shippingAddress.email}_${Date.now()}`;

  const description = `Shop order — ${validation.validatedItems.length} item${
    validation.validatedItems.length === 1 ? "" : "s"
  }`;

  // Stripe caps metadata values at 500 chars, so store only the slim fields
  // needed to rebuild the order. productName/imageUrl/brand are rehydrated
  // from the DB in finalizeShopOrder via productId.
  const slimItems = validation.validatedItems.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    priceCents: i.priceCents,
  }));

  const metadata: Record<string, string> = {
    type: "shop",
    items: JSON.stringify(slimItems),
    shippingAddress: JSON.stringify({
      ...input.shippingAddress,
      country: input.shippingAddress.country ?? "Australia",
    }),
    subtotalCents: String(totals.subtotalCents),
    shippingCents: String(totals.shippingCents),
    gstCents: String(totals.gstCents),
    totalCents: String(totals.totalCents),
    ...(input.user
      ? { userId: input.user._id }
      : {
          guestEmail: input.shippingAddress.email,
          guestFirstName: input.shippingAddress.firstName,
          guestLastName: input.shippingAddress.lastName,
        }),
    ...(input.capiContext?.ip && { capi_client_ip: input.capiContext.ip }),
    ...(input.capiContext?.userAgent && { capi_user_agent: input.capiContext.userAgent }),
    ...(input.capiContext?.fbc && { capi_fbc: input.capiContext.fbc }),
    ...(input.capiContext?.fbp && { capi_fbp: input.capiContext.fbp }),
    ...(input.capiContext?.eventSourceUrl && {
      capi_event_source_url: input.capiContext.eventSourceUrl,
    }),
  };

  // 4. Create the PI
  const { paymentIntent, customerId } = await createShopPurchasePaymentIntent({
    amountCents: totals.totalCents,
    customerEmail: input.shippingAddress.email,
    customerFirstName: input.shippingAddress.firstName,
    customerLastName: input.shippingAddress.lastName,
    customerPhone: input.shippingAddress.phone,
    existingUserId: input.user?._id,
    paymentMethodId: input.paymentMethodId,
    idempotencyKey,
    description,
    metadata,
  });

  return {
    ok: true,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret ?? "",
    customerId,
    status: paymentIntent.status,
  };
}
