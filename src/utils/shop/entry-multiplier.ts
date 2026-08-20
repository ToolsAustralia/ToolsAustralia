/**
 * The merchandise entry multiplier — pure logic, no data layer.
 *
 * Merchandise carries its OWN multiplier, set in admin. It does not inherit the
 * one-time pack rate (owner decision, 2026-08-20, reversing the 2026-08-17
 * "merch inherits" design). A pack promo therefore has no effect on garment
 * entries: if merch should run at 5x, an admin sets 5x here.
 *
 * Three tiers, most specific first:
 *
 *     product  ->  category  ->  whole shop  ->  1x (no multiplication)
 *
 * `1` is the floor and the default, so a shop with nothing configured grants
 * exactly the entries a product advertises. There is no "off" below that: zero
 * would revoke the entries the product itself promises, which is a decision that
 * belongs on `includedEntries`, not here.
 *
 * NOTE FOR WHOEVER READS THIS NEXT: because the merch rate is now independent,
 * nothing structurally prevents merchandise being better value per entry than a
 * one-time pack. That protection used to come from `min(packRate, ceiling)`. It
 * is now a matter of what an admin types, and the admin panel warns rather than
 * enforces — see ShopEntryMultiplierPanel.
 *
 * This file must import NOTHING from `@/models/**`, `@/lib/mongodb`, or
 * mongoose: the product page applies it in the browser, and a client bundle that
 * reaches a Mongoose model throws on load.
 */

/** The lowest and highest multiplier an admin may set. */
export const SHOP_ENTRY_MULTIPLIER_MIN = 1;
export const SHOP_ENTRY_MULTIPLIER_MAX = 10;

/** Applied when no tier specifies anything: the advertised entries, unmultiplied. */
export const DEFAULT_ENTRY_MULTIPLIER = 1;

/**
 * Normalises a product category into a config key.
 *
 * `Product.category` is free text with no enum, behind a free-text admin input,
 * and the vocabulary is ALREADY forked -- the print-provider sync writes
 * "Apparel" while the seeded tools carry "power-tools" and "measuring". Keyed on
 * the raw string, a setting stops matching the moment somebody retypes the
 * category with different casing or a trailing space, with no error anywhere.
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
 * from a product document, and the listing card reads it from a JSON row.
 */
export interface ShopEntryMultiplierSubject {
  category?: string | null;
  entryMultiplier?: number | null;
}

/** The admin-set rates, read once so a multi-line order does not re-query per line. */
export interface ShopEntryMultipliers {
  shopMultiplier: number | null;
  categoryMultipliers: Map<string, number>;
}

/** Nothing configured — every product resolves to DEFAULT_ENTRY_MULTIPLIER. */
export const NO_MULTIPLIERS: ShopEntryMultipliers = {
  shopMultiplier: null,
  categoryMultipliers: new Map(),
};

/**
 * The multiplier in force for one product, most specific tier first.
 *
 * Absence falls through; only an explicit number stops the chain. `null` would be
 * ambiguous with "use the tier above", so a tier with nothing to say says nothing.
 */
export function resolveEntryMultiplierFor(
  subject: ShopEntryMultiplierSubject,
  config: ShopEntryMultipliers
): number {
  if (typeof subject.entryMultiplier === "number") return subject.entryMultiplier;

  if (subject.category) {
    const forCategory = config.categoryMultipliers.get(normaliseCategoryKey(subject.category));
    if (typeof forCategory === "number") return forCategory;
  }

  return config.shopMultiplier ?? DEFAULT_ENTRY_MULTIPLIER;
}

/**
 * What one line of an order actually grants.
 *
 * Kept here rather than inline in the grant so the product page and the webhook
 * compute it with the same function — the display and the grant are independent
 * reads separated by the whole of checkout, and two call sites doing their own
 * arithmetic is how a page promises 40 and the webhook writes 8.
 */
export function entriesForLine(
  includedEntries: number,
  quantity: number,
  multiplier: number
): number {
  return includedEntries * quantity * multiplier;
}
