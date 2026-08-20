import ShopEntryMultiplierConfig from "@/models/ShopEntryMultiplierConfig";
import { NO_MULTIPLIERS, type ShopEntryMultipliers } from "@/utils/shop/entry-multiplier";

/**
 * Reads the admin-set merch entry multipliers from Mongo.
 *
 * SERVER ONLY. This module imports a Mongoose model, so it must never be reached
 * from a client component — mongoose is a `serverExternalPackage` and the model
 * file throws on load in a browser bundle. The pure half of this feature
 * (`resolveEntryMultiplierFor`, `entriesForLine`, `normaliseCategoryKey`) lives
 * in `@/utils/shop/entry-multiplier` precisely so a listing card can resolve a
 * number without dragging the data layer with it.
 *
 * The pure helpers are deliberately NOT re-exported from here. That convenience
 * would look harmless and would restore the crash: importing anything from this
 * path loads this module, and this module loads a model.
 */

/**
 * Loads the admin-set multipliers.
 *
 * Falls back to NO_MULTIPLIERS — i.e. 1x, the advertised entries unmultiplied —
 * if the read throws. A database blip must not invent a multiplier nobody set,
 * in either direction: granting more than promised is unrecoverable, and this
 * path can only ever grant exactly what the product itself advertises.
 */
export async function loadShopEntryMultipliers(): Promise<ShopEntryMultipliers> {
  try {
    const config = await ShopEntryMultiplierConfig.getOrCreate();
    // Mongoose hands back its own Map subclass from a document read and a plain
    // object from a lean() one. Normalise both into a real Map here so callers
    // never have to know which kind of read produced it.
    const raw = config.categoryMultipliers;
    const entries: [string, number][] =
      raw instanceof Map
        ? [...raw.entries()]
        : Object.entries((raw ?? {}) as Record<string, number>);

    return {
      shopMultiplier: config.multiplier ?? null,
      categoryMultipliers: new Map(entries),
    };
  } catch (err) {
    console.error("[shop] entry multipliers unreadable — falling back to 1x", err);
    return NO_MULTIPLIERS;
  }
}
