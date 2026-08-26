/**
 * bonus-code-webhook/auth.ts
 *
 * Shared-secret check for POST /api/bonus-codes/v1/issue — the inbound webhook
 * a Klaviyo flow calls immediately before its discount email.
 *
 * A caller who gets past this mints a real per-customer bonus code, which
 * grants real prize-draw entries. Treat it as a mint authorisation, not as a
 * "is this our cron?" convenience check.
 *
 * THREE properties, all deliberate:
 *
 *  1. FAIL CLOSED on an unset secret.
 *     An unset `BONUS_CODE_WEBHOOK_SECRET` returns
 *     `{ ok: false, status: 500, reason: "misconfigured" }` — never `ok: true`.
 *     **Do NOT copy `src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14`**
 *     (`if (!cronSecret) return true`). That idiom makes the endpoint fully
 *     public the moment an env var is missing, and it compares with `===` on a
 *     raw string. On a mint endpoint that is the entire product given away by a
 *     var nobody set. It is the nearest neighbour in this repo and it is the
 *     wrong one. The shape here mirrors `verifyNormRequest`
 *     (`src/lib/internal-norm/auth.ts:87-95`) instead.
 *     Middleware cannot save you either — its matcher excludes `/api` outright
 *     (`src/middleware.ts`), so this route owns 100% of its own authorization.
 *
 *  2. CONSTANT-TIME compare with a mandatory byte-length pre-check.
 *     `timingSafeEqual` THROWS on unequal-length buffers, so the length guard is
 *     load-bearing, not decorative. It is done on the Buffers (bytes), not on
 *     the strings (UTF-16 code units), so a multi-byte character cannot slip a
 *     length mismatch past it into the throw.
 *
 *  3. COMMA-SEPARATED list, so a secret can be rotated with overlap:
 *     add the new one → marketing updates the flows → remove the old one.
 *     Every candidate is compared; there is no early exit on the first match.
 *
 * NEVER LOG THE SECRET — not raw, not hashed, not truncated, not in an error
 * message, not in an audit row. Nothing in this module ever puts a candidate or
 * the presented value into a string that leaves it.
 */

import { timingSafeEqual } from "node:crypto";

/** The header the Klaviyo webhook action sends the shared secret in. */
export const BONUS_CODE_SECRET_HEADER = "x-bonus-code-secret";

/**
 * Shortest secret this module will accept as configured.
 *
 * A one-character secret is brute-forceable in a single request, and a config
 * line like `BONUS_CODE_WEBHOOK_SECRET= ` trims to nothing. Candidates below
 * this floor are dropped; if that leaves no candidates the verdict is
 * `misconfigured` (a refusal), never an accept. 16 is a low bar chosen so a
 * legitimate operator secret is never rejected by surprise.
 */
export const MIN_SECRET_LENGTH = 16;

export type BonusCodeAuthVerdict =
  | { ok: true }
  /** No usable secret is configured on this deployment. Fail closed. */
  | { ok: false; status: 500; reason: "misconfigured" }
  /** The caller sent no secret header at all. */
  | { ok: false; status: 401; reason: "missing-secret" }
  /** The caller sent a secret and it matched none of the configured ones. */
  | { ok: false; status: 401; reason: "bad-secret" };

/**
 * Byte-wise constant-time string compare.
 *
 * The length guard is required: `timingSafeEqual` throws a RangeError when the
 * two buffers differ in length. Comparing `Buffer.length` (bytes) rather than
 * `String.length` (UTF-16 units) keeps that guard correct for non-ASCII input.
 */
function safeEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Parse `BONUS_CODE_WEBHOOK_SECRET` into its candidate list.
 *
 * Splits on commas, trims each entry, drops empties (so a trailing comma is
 * harmless) and drops anything shorter than `MIN_SECRET_LENGTH`. Exported for
 * tests and for a health check; it returns the COUNT-relevant list, and callers
 * must never log its contents.
 */
export function parseConfiguredSecrets(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SECRET_LENGTH);
}

/**
 * Verify the presented shared secret against the configured list.
 *
 * Synchronous and pure apart from reading `process.env` — no DB, no network, so
 * it cannot fail open on an outage. Call it BEFORE the budget check and before
 * any body parsing.
 *
 * @param presented the raw `X-Bonus-Code-Secret` header value, or null when absent.
 */
export function verifyBonusCodeWebhookSecret(
  presented: string | null | undefined
): BonusCodeAuthVerdict {
  const configured = parseConfiguredSecrets(process.env.BONUS_CODE_WEBHOOK_SECRET);

  if (configured.length === 0) {
    // Fail closed. console.error (not warn/log) because production strips
    // log/info/debug/warn — this must be visible in Vercel logs. The secret
    // itself is never part of this message; only the fact that none parsed.
    console.error(
      "[bonus-code] BONUS_CODE_WEBHOOK_SECRET is unset or has no entry of at least " +
        `${MIN_SECRET_LENGTH} characters — refusing every webhook call (fail-closed).`
    );
    return { ok: false, status: 500, reason: "misconfigured" };
  }

  if (!presented) {
    return { ok: false, status: 401, reason: "missing-secret" };
  }

  // Compare against every candidate — no early exit, so the rotation position
  // of the matching secret is not observable through response timing.
  let matched = false;
  for (const candidate of configured) {
    if (safeEqual(presented, candidate)) matched = true;
  }

  return matched ? { ok: true } : { ok: false, status: 401, reason: "bad-secret" };
}
