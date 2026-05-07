// src/services/shop/shopAnalytics.ts
import type { ValidatedItem } from "./cartValidation.service";

export interface MetaProductPayload {
  content_ids: string[];
  content_type: "product";
  contents: { id: string; quantity: number; item_price: number }[];
  currency: "AUD";
  value: number;
}

export function buildMetaCartPayload(items: ValidatedItem[]): MetaProductPayload {
  const contents = items.map((i) => ({
    id: i.productId,
    quantity: i.quantity,
    item_price: i.priceCents / 100,
  }));
  const value = items.reduce((sum, i) => sum + (i.priceCents * i.quantity) / 100, 0);
  return {
    content_ids: items.map((i) => i.productId),
    content_type: "product",
    contents,
    currency: "AUD",
    value,
  };
}

export interface KlaviyoOrderItem {
  ProductID: string;
  SKU: string;
  ProductName: string;
  Quantity: number;
  ItemPrice: number;
  RowTotal: number;
  ProductCategories?: string[];
  Brand?: string;
  ImageURL?: string;
}

export function buildKlaviyoItems(items: ValidatedItem[]): KlaviyoOrderItem[] {
  return items.map((i) => ({
    ProductID: i.productId,
    SKU: i.productId,
    ProductName: i.productName,
    Quantity: i.quantity,
    ItemPrice: i.priceCents / 100,
    RowTotal: (i.priceCents * i.quantity) / 100,
    Brand: i.brand ?? undefined,
    ImageURL: i.imageUrl ?? undefined,
  }));
}

export function buildKlaviyoPlacedOrderProperties(input: {
  orderNumber: string;
  items: ValidatedItem[];
  totalCents: number;
  shippingCents: number;
  gstCents: number;
}) {
  return {
    $event_id: input.orderNumber,
    $value: input.totalCents / 100,
    OrderId: input.orderNumber,
    Categories: Array.from(new Set(input.items.flatMap((i) => (i.brand ? [i.brand] : [])))),
    ItemNames: input.items.map((i) => i.productName),
    Items: buildKlaviyoItems(input.items),
    SubTotal: (input.totalCents - input.shippingCents) / 100,
    ShippingTotal: input.shippingCents / 100,
    TaxTotal: input.gstCents / 100,
    GrandTotal: input.totalCents / 100,
  };
}
