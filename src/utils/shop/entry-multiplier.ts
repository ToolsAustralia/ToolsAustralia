/**
 * The merchandise entry-multiplier CEILING — pure logic, no data layer.
 *
 * Deliberately separate from `services/shop/resolveShopEntryMultiplier`, which
 * reads the config from Mongo. The product page needs `applyShopEntryCap` on the
 * CLIENT (it applies the ceiling to a live promo rate read in the browser), and a
 * client component that reaches a module importing `@/models/**` crashes: mongoose
 * is a `serverExternalPackage`, so `mongoose.models` is `undefined` in that bundle
 * and the model file throws on load.
 *
 * So the rule for this file: **nothing here may import a model, `@/lib/mongodb`,
 * or mongoose.** Everything here must be safe to run in a browser.
 */

/**
 * The lowest and highest ceiling an admin may set.
 *
 * 1 is the floor rather than 0 because a ceiling of zero would revoke the free
 * entries a product advertises — a pricing decision belonging on the product
 * (`includedEntries`), not a promo control. 10 is the top of PROMO_MULTIPLIERS,
 * so a ceiling above it could never bind.
 */
export const SHOP_ENTRY_CAP_MIN = 1;
export const SHOP_ENTRY_CAP_MAX = 10;

/**
 * Normalises a product category into a ceiling key.
 *
 * `Product.category` is free text with no enum, behind a free-text admin input,
 * and the vocabulary is ALREADY forked — the print-provider sync writes "Apparel"
 * while the seeded tools carry "power-tools" and "measuring". Keyed on the raw
 * string, a ceiling stops matching the moment somebody retypes the category with
 * different casing or a trailing space, with no error anywhere.
 *
 * Must be applied on write AND on read. Applying it to only one side is worse
 * than applying it to neither, because the mismatch then depends on which value
 * happened to be saved first.
 */
export function normaliseCategoryKey(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * The product-shaped facts the tier chain needs. Deliberately structural rather
 * than `IProduct`: the grant reads it from a frozen ORDER LINE, the page reads it
 * from a product document, and forcing either to satisfy a Mongoose document type
 * would mean a fetch neither caller needs — and would drag the model into the
 * client bundle, which is the bug this split exists to prevent.
 */
export interface ShopEntryMultiplierSubject {
  category?: string | null;
  entryMultiplierCap?: number | null;
}

/** The ceilings in force, read once so a multi-line order does not re-query per line. */
export interface ShopEntryCaps {
  shopCap: number | null;
  categoryCaps: Map<string, number>;
}

/** No ceilings at all — i.e. inherit the promo unchanged. */
export const NO_CAPS: ShopEntryCaps = { shopCap: null, categoryCaps: new Map() };

/**
 * The ceiling in force for one product, most specific tier first.
 *
 * Absence falls through; only an explicit number stops the chain. `null` would be
 * ambiguous with "inherit", so a tier that has nothing to say says nothing.
 */
export function resolveCapFor(
  subject: ShopEntryMultiplierSubject,
  caps: ShopEntryCaps
): number | null {
  if (typeof subject.entryMultiplierCap === "number") return subject.entryMultiplierCap;

  if (subject.category) {
    const categoryCap = caps.categoryCaps.get(normaliseCategoryKey(subject.category));
    if (typeof categoryCap === "number") return categoryCap;
  }

  return caps.shopCap;
}

/**
 * The multiplier to apply to one product.
 *
 * `Math.min` sits OUTSIDE the tier chain on purpose. Because it is applied once,
 * after resolution, no tier -- however specific -- can return a value above
 * `inherited`. The 2026-08-17 invariant ("merchandise cannot overtake the packs")
 * therefore holds by construction rather than by a runtime check at each of four
 * tiers, three of which somebody would eventually forget.
 */
export function applyShopEntryCap(
  inherited: number,
  subject: ShopEntryMultiplierSubject,
  caps: ShopEntryCaps
): number {
  const cap = resolveCapFor(subject, caps);
  return cap == null ? inherited : Math.min(inherited, cap);
}
