/**
 * Fields a PUBLIC product read must never return.
 *
 * Everything here is supplier-facing or personal, and every one of these routes is
 * unauthenticated — several are edge-cached, so a single leak is served to
 * everyone until the cache turns over.
 *
 *  - `printArtwork`  the print-ready design files, on permanent public URLs.
 *    Publishing them hands anyone the artwork to print the garment themselves.
 *  - `printProvider` our provenance on the print account.
 *  - `reviews.userId` ties an identifiable account to a purchase. The reviews API
 *    strips it deliberately; a raw product read bypasses that entirely.
 *
 * Used as a Mongoose exclusion projection so a field added to the model in future
 * is public by default — which is the right default for a catalogue, provided
 * anything sensitive is added to this list at the same time.
 */
export const PUBLIC_PRODUCT_EXCLUDE = "-printArtwork -printProvider -reviews.userId";
