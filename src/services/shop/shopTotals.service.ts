// src/services/shop/shopTotals.service.ts
export interface ShopTotalsInput {
  items: { productId: string; priceCents: number; quantity: number }[];
  freeShippingThresholdCents: number;
  flatShippingRateCents: number;
}

export interface ShopTotals {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  gstCents: number;
  appliedDiscounts: { type: string; amount: number; description: string }[];
}

export function computeShopTotals(input: ShopTotalsInput): ShopTotals {
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const shippingCents =
    subtotalCents === 0
      ? 0
      : subtotalCents >= input.freeShippingThresholdCents
        ? 0
        : input.flatShippingRateCents;
  const totalCents = subtotalCents + shippingCents;
  const gstCents = totalCents === 0 ? 0 : Math.round(totalCents / 11);
  return {
    subtotalCents,
    shippingCents,
    totalCents,
    gstCents,
    appliedDiscounts: [],
  };
}
