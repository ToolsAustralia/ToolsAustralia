import crypto from "crypto";

/**
 * SHA256 hash for PII — Meta requires lowercase, trimmed input before hashing.
 *
 * Lives in its OWN dependency-light module (only Node `crypto`, no network/undici) so that
 * client-side tracking helpers (e.g. `@/utils/tracking/facebook-helpers`, imported by the
 * `MembershipModal` client component) can import `hashData` WITHOUT transitively pulling in
 * `@/lib/facebook` — which imports the server-only `@/lib/http/outbound` (undici). undici needs
 * `node:net`, which Turbopack cannot bundle for the browser; a client component reaching that
 * chain crashed the whole app at load with `Cannot find module 'node:net'`.
 *
 * KEEP THIS MODULE FREE of any server-only imports (no undici, no network, no `@/lib/facebook`).
 */
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data.toLowerCase().trim()).digest("hex");
}
