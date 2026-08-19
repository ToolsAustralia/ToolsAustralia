import Product from "@/models/Product";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import {
  fetchPrintProviderProduct,
  listPrintProviderProducts,
  type PrintProviderProduct,
} from "@/lib/print-provider/client";

/**
 * Pull a product from the print provider into our catalogue.
 *
 * Two rules shape everything here.
 *
 * MIRROR EVERY IMAGE. The provider serves mockups from `/users/{uid}/...`, and
 * the uid is our API key until it is rotated. Hotlinking would publish a live
 * credential in every customer's page source, so each image is copied to
 * Cloudinary and only our own URL is stored. The public_id is derived from the
 * product and colour, so a re-sync overwrites in place instead of growing a new
 * copy every run.
 *
 * NEVER OVERWRITE WHAT A HUMAN OWNS. The provider knows the garment: name,
 * variants, colours, mockups. It does NOT know our retail price, included
 * entries, category or featured flag — those are commercial decisions set in
 * admin. A re-sync refreshes the former and leaves the latter untouched, so
 * re-running this after a price change cannot silently revert it.
 */

export interface SyncedProductSummary {
  productId: string;
  name: string;
  created: boolean;
  variants: number;
  colourways: number;
  imagesMirrored: number;
  imagesFailed: number;
  /** Colours the blank offers that no variant exists for yet. */
  uncreatedColours: string[];
}

/** Cloudinary rejects most punctuation in a public_id. */
const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function mirrorImage(
  sourceUrl: string,
  folder: string,
  publicId: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const uploaded = await uploadImageToCloudinary(buffer, folder, {
      public_id: publicId,
      tags: ["print-provider", "merch"],
    });
    return uploaded.secure_url;
  } catch {
    // One unreachable mockup must not fail the whole product — the colour simply
    // lands without that view, and the count is reported back to the caller.
    return null;
  }
}

/**
 * @param providerId the opaque provider id from `listPrintProviderProducts`.
 *   In-memory only — it may embed the account uid, so it is never persisted or
 *   returned to a client. Callers holding only our stable `platformProductId`
 *   should use `syncByPlatformProductId`.
 */
export async function syncPrintProviderProduct(providerId: string): Promise<SyncedProductSummary> {
  const source: PrintProviderProduct = await fetchPrintProviderProduct(providerId);
  const platformProductId = source.platformProductId;

  const existing = await Product.findOne({
    "printProvider.platformProductId": platformProductId,
  });

  const folder = `shop/print-provider/${slug(source.name)}`;
  let imagesMirrored = 0;
  let imagesFailed = 0;

  const colourways: { name: string; hex?: string; images: string[] }[] = [];
  for (const colour of source.colourways) {
    const images: string[] = [];
    for (const [index, url] of colour.imageUrls.entries()) {
      const mirrored = await mirrorImage(url, folder, `${slug(colour.name)}-${index}`);
      if (mirrored) {
        images.push(mirrored);
        imagesMirrored++;
      } else {
        imagesFailed++;
      }
    }
    colourways.push({ name: colour.name, ...(colour.hex ? { hex: colour.hex } : {}), images });
  }

  const variants = source.variants.map((v) => ({
    sku: v.sku,
    ...(v.size ? { size: v.size } : {}),
    ...(v.colour ? { colour: v.colour } : {}),
    isActive: true,
  }));

  // The gallery's lead images: the first shot of each colour, so a customer sees
  // the range at a glance rather than four angles of the same black tee.
  const images = colourways.map((c) => c.images[0]).filter((url): url is string => !!url);

  const providerOwned = {
    name: source.name,
    variants,
    colourways,
    ...(images.length > 0 ? { images } : {}),
    printProvider: {
      blankProductId: source.blankProductId ?? undefined,
      platformProductId,
      syncedAt: new Date(),
    },
    // Print-to-order: the printer makes it on demand, so stock must never gate it.
    trackInventory: false,
  };

  if (existing) {
    Object.assign(existing, providerOwned);
    await existing.save();
    return summarise(existing._id.toString(), source, false, imagesMirrored, imagesFailed, colourways.length);
  }

  // First sync only: seed the commercial fields with safe defaults an admin then
  // owns. `price: 0` and `isActive: false` mean a half-configured product can
  // never appear in the shop by accident.
  const created = await Product.create({
    ...providerOwned,
    description: source.description || source.name,
    price: 0,
    category: "Apparel",
    brand: "Tools Australia",
    stock: 0,
    includedEntries: 0,
    isActive: false,
    isFeatured: false,
    features: [],
    tags: [],
  });

  return summarise(created._id.toString(), source, true, imagesMirrored, imagesFailed, colourways.length);
}

function summarise(
  productId: string,
  source: PrintProviderProduct,
  created: boolean,
  imagesMirrored: number,
  imagesFailed: number,
  colourways: number
): SyncedProductSummary {
  return {
    productId,
    name: source.name,
    created,
    variants: source.variants.length,
    colourways,
    imagesMirrored,
    imagesFailed,
    uncreatedColours: source.uncreatedColours.map((c) => c.name),
  };
}

/**
 * Re-sync one product we already hold, addressed by the stable id we persist.
 *
 * The provider's own id is opaque and unsafe to store, so it is resolved from the
 * live listing each time. That costs one extra request and means an admin can
 * never send us a provider id — the only identifier that crosses the wire is ours.
 */
export async function syncByPlatformProductId(
  platformProductId: string
): Promise<SyncedProductSummary> {
  const refs = await listPrintProviderProducts();
  for (const ref of refs) {
    const source = await fetchPrintProviderProduct(ref.id);
    if (source.platformProductId === platformProductId) {
      return syncPrintProviderProduct(ref.id);
    }
  }
  throw new Error("That product is no longer visible to the print provider API");
}

/** Sync every product the provider will show us. */
export async function syncAllPrintProviderProducts(): Promise<SyncedProductSummary[]> {
  const refs = await listPrintProviderProducts();
  const results: SyncedProductSummary[] = [];
  for (const ref of refs) {
    try {
      results.push(await syncPrintProviderProduct(ref.id));
    } catch (err) {
      // Keep going: one bad product should not block the rest, and the failure is
      // visible because that product is absent from the returned list.
      console.error("[shop] print provider sync failed for a product", {
        name: ref.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
