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
 * re-running this after a price change cannot silently revert it. The line runs
 * through a variant as well as around it: which variants exist, and their sku,
 * size and colour, are the provider's; the gtin and whether we still sell that
 * size are typed in admin, so both are carried back on by sku.
 */

export interface SyncedProductSummary {
  productId: string;
  name: string;
  created: boolean;
  variants: number;
  colourways: number;
  imagesMirrored: number;
  imagesFailed: number;
  /** Already held from a previous sync, so not re-uploaded. */
  imagesReused: number;
  /** Colours the blank offers that no variant exists for yet. */
  uncreatedColours: string[];
}

/**
 * The public_id back out of a Cloudinary URL: the last path segment, minus its
 * extension. Used to match a stored image to the job that would produce it,
 * without depending on array positions that do not survive a failed mirror.
 */
function publicIdFromCloudinaryUrl(url: string): string | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0];
  const last = withoutQuery.split("/").pop();
  if (!last) return null;
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(0, dot) : last;
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
  let imagesReused = 0;

  // What we already hold, so a re-sync does not pay to move bytes that have not
  // changed. Keyed by the public_id we would upload to, which is derived from
  // colour and index and is therefore stable across syncs.
  // Keyed by the Cloudinary public_id parsed back OUT of the stored URL, not by the
  // position in the stored array.
  //
  // The stored array is compacted -- a mirror that fails is simply absent -- so
  // positions do not survive a failure. If a colour's second image failed once,
  // every later image shifted down one, and the next sync then reused the wrong
  // picture for every remaining slot and duplicated one. The failed image could
  // also never be retried, because its position now belonged to another image.
  //
  // The public_id is derived from colour and SOURCE index, so it is stable across
  // syncs and independent of what happened to land last time. A missing key simply
  // re-downloads, which is how a previously-failed image finally arrives.
  const alreadyMirrored = new Map<string, string>();
  for (const c of existing?.colourways ?? []) {
    for (const url of c.images ?? []) {
      const publicId = publicIdFromCloudinaryUrl(url);
      if (publicId) alreadyMirrored.set(publicId, url);
    }
  }

  // Every image of every colour as one flat work list. Mirroring is network-bound
  // at both ends, so it runs concurrently — sequentially this took just under
  // seven minutes for 177 images, which would blow the route's 300s ceiling on a
  // first sync. The cap is deliberately modest: Cloudinary rate-limits, and the
  // provider's storage is not ours to hammer.
  const jobs = source.colourways.flatMap((colour, ci) =>
    colour.imageUrls.map((url, index) => ({ ci, index, url, publicId: `${slug(colour.name)}-${index}` }))
  );

  const CONCURRENCY = 6;
  const done: (string | null)[] = new Array(jobs.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= jobs.length) return;
        const job = jobs[i];
        const reuse = alreadyMirrored.get(job.publicId);
        if (reuse) {
          done[i] = reuse;
          imagesReused++;
          continue;
        }
        const mirrored = await mirrorImage(job.url, folder, job.publicId);
        done[i] = mirrored;
        if (mirrored) imagesMirrored++;
        else imagesFailed++;
      }
    })
  );

  const colourways: { name: string; hex?: string; images: string[] }[] = source.colourways.map(
    (colour) => ({
      name: colour.name,
      ...(colour.hex ? { hex: colour.hex } : {}),
      images: [],
    })
  );
  jobs.forEach((job, i) => {
    const url = done[i];
    if (url) colourways[job.ci].images.push(url);
  });

  // What an admin typed on a variant, keyed by the sku that identifies it across
  // syncs. The provider payload carries no gtin and no notion of a variant being
  // sellable, so neither can be refreshed from it — without carrying them over,
  // the assign below would blank every hand-typed gtin, which empties the
  // product-id column of the fulfilment CSV and leaves the printer unable to
  // match the line.
  const authored = new Map<string, { gtin?: string; isActive: boolean }>();
  for (const v of existing?.variants ?? []) {
    authored.set(v.sku, { gtin: v.gtin, isActive: v.isActive });
  }

  // Built from the provider's list, not merged into ours, so a variant the
  // provider has dropped stays dropped rather than resurrecting from what we
  // hold. A variant we have not seen before has no gtin yet and starts sellable.
  const variants = source.variants.map((v) => {
    const held = authored.get(v.sku);
    return {
      sku: v.sku,
      ...(v.size ? { size: v.size } : {}),
      ...(v.colour ? { colour: v.colour } : {}),
      ...(held?.gtin ? { gtin: held.gtin } : {}),
      isActive: held?.isActive ?? true,
    };
  });

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
    return summarise(existing._id.toString(), source, false, imagesMirrored, imagesFailed, imagesReused, colourways.length);
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

  return summarise(created._id.toString(), source, true, imagesMirrored, imagesFailed, imagesReused, colourways.length);
}

function summarise(
  productId: string,
  source: PrintProviderProduct,
  created: boolean,
  imagesMirrored: number,
  imagesFailed: number,
  imagesReused: number,
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
    imagesReused,
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
