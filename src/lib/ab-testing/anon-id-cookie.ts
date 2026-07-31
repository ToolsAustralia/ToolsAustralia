/**
 * Edge-safe anonymous-id cookie contract.
 *
 * `AnonymousIdService` owns the same cookie but imports `next/headers` and node
 * `crypto`, neither of which is available in middleware's edge runtime — hence
 * this tiny shared module rather than a re-export. Keep the name, TTL and
 * validation rule identical to AnonymousIdService or assignments will split
 * across two ids for the same visitor.
 */
export const ANON_ID_COOKIE_NAME = "ta_anon_id";
export const ANON_ID_MAX_AGE = 90 * 24 * 60 * 60; // 90 days, matches AnonymousIdService

/**
 * Browser-READABLE mirror of `ANON_ID_COOKIE_NAME` — same concept, same value, one name for
 * the concept. It exists only because `ta_anon_id` is deliberately `httpOnly` (the A/B
 * assignment identity must not be readable/forgeable from page JS), which also means
 * client-side pixels cannot read it. TikTok's EMQ panel wants `external_id` coverage >90% on
 * PageView and we sit at 3%, so the browser pixel needs a stable anonymous id it can actually
 * read: it reads this.
 *
 * This is NOT a second identity and must never diverge. Middleware writes both cookies from
 * the same value on the same request (and backfills the mirror for visitors who predate it).
 * Never mint an id into this cookie independently, and never read it as the authority —
 * `ta_anon_id` stays the source of truth for assignment.
 */
export const ANON_ID_PUBLIC_COOKIE_NAME = "ta_anon_id_pub";

export function isValidAnonymousId(id: string): boolean {
  return id.startsWith("anon_") && id.length > 5 && id.length < 100;
}

/** Web Crypto only — `crypto.randomUUID` is available in the edge runtime. */
export function generateAnonymousId(): string {
  return `anon_${crypto.randomUUID()}`;
}
