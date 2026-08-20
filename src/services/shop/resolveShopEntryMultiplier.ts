import ShopEntryMultiplierConfig from "@/models/ShopEntryMultiplierConfig";
import { NO_CAPS, type ShopEntryCaps } from "@/utils/shop/entry-multiplier";

/**
 * Reads the admin-set entry-multiplier ceilings from Mongo.
 *
 * SERVER ONLY. This module imports a Mongoose model, so it must never be reached
 * from a client component — mongoose is a `serverExternalPackage` and the model
 * file throws on load in a browser bundle. The pure half of this feature
 * (`applyShopEntryCap`, `resolveCapFor`, `normaliseCategoryKey`) lives in
 * `@/utils/shop/entry-multiplier` precisely so the product page can apply a
 * ceiling client-side without dragging the data layer with it.
 */

// The pure helpers are deliberately NOT re-exported from here. Re-exporting them
// would look like a convenience and would restore the exact crash this split
// fixes: a client component importing `applyShopEntryCap` from this path still
// loads this module, and this module imports a model. Every caller states which
// half it needs — `@/utils/shop/entry-multiplier` for the maths, this file for
// the read.

/**
 * Loads the admin-set ceilings.
 *
 * Falls back to NO_CAPS -- i.e. inherit unchanged -- if the read throws. That
 * direction is deliberate: a database blip must never silently WITHHOLD entries
 * a customer was promised on the page. It can only ever grant what the promo
 * already permits, which is the pre-existing behaviour.
 */
export async function loadShopEntryCaps(): Promise<ShopEntryCaps> {
  try {
    const config = await ShopEntryMultiplierConfig.getOrCreate();
    // Mongoose hands back its own Map subclass from a document read and a plain
    // object from a lean() one. Normalise both into a real Map here so callers
    // never have to know which kind of read produced it.
    const raw = config.categoryCaps;
    const entries: [string, number][] =
      raw instanceof Map
        ? [...raw.entries()]
        : Object.entries((raw ?? {}) as Record<string, number>);

    return { shopCap: config.cap ?? null, categoryCaps: new Map(entries) };
  } catch (err) {
    console.error("[shop] entry multiplier caps unreadable — inheriting uncapped", err);
    return NO_CAPS;
  }
}
