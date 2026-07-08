/**
 * localStorage guard for browser-side Purchase pixel fires on success pages.
 * Key: purchasePixelFired_${eventId} → String(Date.now()) of the FIRST fire.
 *
 * Why: the success pages (/purchase-success, /upsell-success, /mini-draw-success,
 * /checkout/success) fire the Purchase pixel on mount, and their `firedRef` only
 * survives a single mount. Meta deduplicates identical event_ids for ~48 hours,
 * anchored at the FIRST event received — so a refresh today is merged harmlessly,
 * but reopening the same success URL (history, restored tab) MORE than 48h after
 * purchase re-fires a fully-valued Purchase that Meta counts as a brand-new
 * conversion.
 *
 * Suppression is deliberately window-aware, not fire-once:
 * - Re-fires INSIDE the dedup window stay allowed — Meta merges them, and they
 *   recover a first fire that was silently swallowed (ad blocker, tab closed
 *   before fbevents.js drained its queue). This matters most for shop checkout,
 *   which has no server CAPI Purchase to fall back on.
 * - Re-fires OUTSIDE the window are suppressed — those are the ones Meta would
 *   double-count. The mark keeps the first-fire timestamp on re-fires so the
 *   suppression window can't slide.
 *
 * Deliberately NOT cleared on sign-out: it holds no user data (only a Stripe
 * PaymentIntent id / order number) and clearing it would reintroduce the >48h
 * re-fire.
 *
 * Every operation is wrapped so a broken/full storage (Safari private mode)
 * degrades to the pre-guard behavior instead of breaking the success page.
 */

const KEY_PREFIX = "purchasePixelFired_";
// Meta's dedup window is 48h from the first received event; suppress from 46h so a
// re-fire can't race the boundary (in the 46-48h sliver we suppress a merge-safe
// fire — the harmless direction).
const SUPPRESS_AFTER_MS = 46 * 60 * 60 * 1000;
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days ≫ the dedup window

/**
 * True when a re-fire for this eventId would be COUNTED AS A NEW conversion by
 * Meta (first fire recorded longer ago than the dedup window, or at an unknown
 * time). False while a re-fire would still be merged — let it fire.
 */
export function shouldSuppressPurchasePixel(eventId: string): boolean {
  if (typeof window === "undefined" || !eventId) return false;
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${eventId}`);
    if (raw === null) return false;
    const firedAt = Number(raw);
    // Unparsable = "fired at an unknown time" — suppress (the failure mode this
    // guard exists for is inflation, not under-count).
    if (!Number.isFinite(firedAt)) return true;
    return Date.now() - firedAt > SUPPRESS_AFTER_MS;
  } catch {
    return false;
  }
}

/** Record the first fire time for eventId. Re-marks keep the original anchor. */
export function markPurchasePixelFired(eventId: string): void {
  if (typeof window === "undefined" || !eventId) return;
  try {
    pruneStaleEntries();
    const key = `${KEY_PREFIX}${eventId}`;
    // Never overwrite: Meta's dedup window anchors at the FIRST received event, so
    // refreshing the timestamp on a re-fire would slide our suppression window and
    // re-open >48h double counts.
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, String(Date.now()));
    }
  } catch {
    // Storage unavailable/full — Meta's 48h event_id dedup remains the fallback.
  }
}

/** Drop namespaced entries older than 30 days (or unparsable) so storage never grows unbounded. */
function pruneStaleEntries(): void {
  try {
    const storage = window.localStorage;
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const firedAt = Number(storage.getItem(key));
      if (!Number.isFinite(firedAt) || firedAt < cutoff) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Pruning is best-effort only.
  }
}
