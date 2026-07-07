import RecoveryClaim from "@/models/RecoveryClaim";

/**
 * Acquire/release the per-subscription recovery lock (`RecoveryClaim`). Serializes stranded
 * past-due recovery so concurrent member clicks and cross-tool attempts can't finalize+pay
 * two different held drafts for the same subscription.
 */

/** A claim older than this is treated as abandoned (crash) and may be reclaimed. */
export const RECOVERY_CLAIM_STALE_MS = 120_000; // 2 min

function claimId(subscriptionId: string): string {
  return `recover:${subscriptionId}`;
}

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
}

/**
 * Try to win the per-subscription recovery lock.
 *
 * Returns `true` if acquired (no live claim, or the existing claim is stale and was reclaimed),
 * `false` if another entry currently holds a live claim. The stale-reclaim is deterministic
 * (filter on `claimedAt < now - RECOVERY_CLAIM_STALE_MS`) and fires before the model's TTL.
 *
 * `now` is injectable for tests.
 */
export async function acquireRecoveryClaim(
  subscriptionId: string,
  claimedBy: string,
  now: Date = new Date()
): Promise<boolean> {
  const _id = claimId(subscriptionId);
  const staleCutoff = new Date(now.getTime() - RECOVERY_CLAIM_STALE_MS);
  try {
    // Filter matches when: no doc (upsert inserts → win) OR the existing claim is stale
    // (update refreshes it → win). A LIVE claim does NOT match the filter, so the upsert
    // attempts an insert on the existing _id and throws E11000 → we lost the race.
    await RecoveryClaim.findOneAndUpdate(
      { _id, claimedAt: { $lt: staleCutoff } },
      { $set: { claimedAt: now, claimedBy } },
      { upsert: true, new: true }
    );
    return true;
  } catch (e) {
    if (isDuplicateKeyError(e)) return false;
    throw e;
  }
}

/** Release the lock so the next entry can acquire immediately. Safe to call when not held. */
export async function releaseRecoveryClaim(subscriptionId: string): Promise<void> {
  await RecoveryClaim.deleteOne({ _id: claimId(subscriptionId) });
}
