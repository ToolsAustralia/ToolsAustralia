import Winner from "@/models/Winner";
import { deleteCloudinaryImageByUrl } from "@/lib/cloudinary";

/**
 * Permanently deletes the Cloudinary assets for prize images that were removed
 * from a draw on save — to reclaim storage. Best-effort: never throws (logs
 * failures via console.error) so it can't block the admin save.
 *
 * Safety guard: an image is NOT deleted if it's still referenced by a Winner
 * record (its point-in-time `prizeSnapshot.images` or `imageUrl`), so deleting
 * here can never 404 a historical winner's artwork.
 *
 * @returns the URLs that were actually deleted from Cloudinary.
 */
export async function deleteRemovedPrizeImages(
  oldImages: string[] = [],
  newImages: string[] = []
): Promise<string[]> {
  const next = new Set(newImages);
  const removed = oldImages.filter((url) => url && !next.has(url));
  if (removed.length === 0) return [];

  const deleted: string[] = [];
  try {
    // Which removed URLs are still referenced by a winner snapshot / photo?
    const refs = (await Winner.find({
      $or: [{ "prizeSnapshot.images": { $in: removed } }, { imageUrl: { $in: removed } }],
    })
      .select("prizeSnapshot.images imageUrl")
      .lean()) as Array<{ prizeSnapshot?: { images?: string[] }; imageUrl?: string }>;

    const referenced = new Set<string>();
    for (const r of refs) {
      (r.prizeSnapshot?.images ?? []).forEach((u) => referenced.add(u));
      if (r.imageUrl) referenced.add(r.imageUrl);
    }

    for (const url of removed) {
      if (referenced.has(url)) {
        console.error(`[prize-image-cleanup] kept ${url} — still referenced by a winner record`);
        continue;
      }
      if (await deleteCloudinaryImageByUrl(url)) deleted.push(url);
    }
  } catch (error) {
    console.error("[prize-image-cleanup] failed:", error);
  }
  return deleted;
}
