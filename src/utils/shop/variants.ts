/**
 * Pure variant helpers for the shop catalogue.
 *
 * Kept free of Mongoose types so they can be unit-tested and imported from
 * client components. The `*Like` shapes are the minimum each function needs —
 * an IProduct satisfies VariantHostLike structurally.
 */

export interface ProductVariantLike {
  sku: string;
  size?: string;
  colour?: string;
  /** Supplier blank identifier. Undefined until the print provider gives us one. */
  gtin?: string;
  isActive: boolean;
}

export interface VariantHostLike {
  isActive: boolean;
  /** false for print-to-order items, where stock is meaningless. */
  trackInventory: boolean;
  stock: number;
  variants: ProductVariantLike[];
}

export function findVariantBySku<T extends ProductVariantLike>(
  variants: readonly T[],
  sku: string
): T | null {
  return variants.find((v) => v.sku === sku) ?? null;
}

export function variantLabel(variant: ProductVariantLike): string {
  const parts = [variant.colour, variant.size].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" · ") : variant.sku;
}

export function activeVariants<T extends ProductVariantLike>(host: {
  variants: readonly T[];
}): T[] {
  return host.variants.filter((v) => v.isActive);
}

export function isVariantPurchasable(
  host: VariantHostLike,
  variant: ProductVariantLike
): boolean {
  if (!host.isActive) return false;
  if (!variant.isActive) return false;
  // Print-to-order: the printer makes it on demand, so stock never gates it.
  if (!host.trackInventory) return true;
  return host.stock > 0;
}
