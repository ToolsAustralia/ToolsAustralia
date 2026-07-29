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

export function isValidAnonymousId(id: string): boolean {
  return id.startsWith("anon_") && id.length > 5 && id.length < 100;
}

/** Web Crypto only — `crypto.randomUUID` is available in the edge runtime. */
export function generateAnonymousId(): string {
  return `anon_${crypto.randomUUID()}`;
}
