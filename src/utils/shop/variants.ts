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

export interface ColourwayLike {
  name: string;
  hex?: string;
  images?: string[];
}

/**
 * Colour-then-size selection.
 *
 * A printed tee runs to 383 variants, so one chip per variant is unusable — the
 * customer picks a colour, then a size, and the pair resolves to the sku. These
 * helpers exist because that resolution has to agree exactly between the picker,
 * the gallery and what gets added to the cart.
 */

/** Colours that actually have a purchasable variant, in catalogue order. */
export function purchasableColours(
  host: VariantHostLike,
  colourways: readonly ColourwayLike[]
): ColourwayLike[] {
  const live = new Set(
    host.variants
      .filter((v) => isVariantPurchasable(host, v) && v.colour)
      .map((v) => v.colour as string)
  );
  return colourways.filter((c) => live.has(c.name));
}

/**
 * Sizes offered in one colour.
 *
 * Not every colour comes in every size — the tee has 51 colours and 9 sizes but
 * 383 variants, not 459, so 76 pairs do not exist. Deriving this per colour is
 * what stops the picker offering a size that cannot be made.
 */
export function sizesForColour(
  host: VariantHostLike,
  colour: string,
  sizeOrder: readonly string[] = []
): { size: string; available: boolean }[] {
  const rows = host.variants.filter((v) => v.colour === colour && v.size);
  const seen = new Map<string, boolean>();
  for (const v of rows) {
    const size = v.size as string;
    seen.set(size, (seen.get(size) ?? false) || isVariantPurchasable(host, v));
  }
  const entries = [...seen].map(([size, available]) => ({ size, available }));
  if (sizeOrder.length === 0) return entries;
  return entries.sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size));
}

/** The sku for a colour/size pair, or null when that combination is not made. */
export function findVariantByOptions<T extends ProductVariantLike>(
  variants: readonly T[],
  colour: string | null,
  size: string | null
): T | null {
  if (!colour && !size) return null;
  return (
    variants.find(
      (v) => (!colour || v.colour === colour) && (!size || v.size === size)
    ) ?? null
  );
}

/** Australian apparel run, smallest first. Anything unlisted sorts to the end. */
export const SIZE_ORDER = [
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL",
] as const;
