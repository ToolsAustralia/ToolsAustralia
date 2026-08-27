/**
 * The image formats a product photo may be uploaded in.
 *
 * ONE list, imported by both the client picker (`ImageUpload`) and the server guard
 * (`/api/upload`). It was previously typed out in three places, which is how a format
 * ends up accepted by the file input and then rejected by the API — the upload appears
 * to start and dies with "File type not supported".
 *
 * The server list is the one that MATTERS: the client `accept` attribute is a
 * convenience the browser applies to the file picker, and a determined caller can
 * always POST anything. Never rely on the client half for safety.
 *
 * WHY THESE FORMATS
 *   jpeg/jpg/png  the universal baseline; every camera and design tool emits one.
 *   webp          what our own pipeline outputs, and what the catalogue already stores.
 *   avif          better compression than webp at the same quality; increasingly the
 *                 default export from modern tooling.
 *   heic/heif     WHAT AN IPHONE PHOTOGRAPHS IN, by default. Staff shooting a product
 *                 on a phone hit this constantly, and before it was added the upload
 *                 simply refused with no hint that the fix is "export as JPEG".
 *
 * Cloudinary transcodes all of these on ingest, so nothing downstream has to care —
 * `next/image` never sees a HEIC.
 *
 * Deliberately EXCLUDED: `image/gif` (animation has no place in a product shot and the
 * first frame is usually what you wanted anyway) and `image/svg+xml` (an SVG can carry
 * script; it is an XSS vector, not a photograph).
 */
export const PRODUCT_IMAGE_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
];

/**
 * For the file input's `accept`.
 *
 * Extensions are included alongside the MIME types because some platforms report an
 * empty or wrong `type` for HEIC, and the picker would then hide the very files this
 * list exists to allow.
 */
export const PRODUCT_IMAGE_ACCEPT = [
  ...PRODUCT_IMAGE_MIME_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
].join(",");

/** Human-readable, for an error message a person can act on. */
export const PRODUCT_IMAGE_FORMAT_LABEL = "JPEG, PNG, WebP, AVIF or HEIC";
