/**
 * bonus-code-webhook/audit.ts
 *
 * Best-effort audit trail for POST /api/bonus-codes/v1/issue.
 *
 * WRITE A ROW FOR EVERY CALL — accepted, refused AND errored. The refused ones
 * carry most of the value: the response body on this route is deliberately
 * opaque (`{ "ok": true }` / `{ "ok": false }`) so it cannot be used as a
 * customer-state oracle, which means the ONLY place a refusal is visible is
 * here. A rising rate of `bad_secret` / `user_not_found` rows is how an
 * enumeration sweep, or a marketing flow whose merge tags broke, becomes
 * something you can see instead of something you find out about later.
 *
 * NEVER THROWS. An audit failure must not fail the customer's request — the
 * discount email is already in flight from the Klaviyo flow, and losing the
 * grant because a log write hiccuped would be strictly worse than losing the
 * log line. Everything is wrapped; failures go to `console.error` (production
 * strips log/info/debug/warn, so `error` is the only level that survives).
 * The cost of that choice is stated in `budget.ts`: an unwritten row is an
 * uncounted mint, which loosens the daily cap slightly. That trade is
 * deliberate and one-directional.
 *
 * NEVER STORES A RAW IP. `writeBonusCodeWebhookCall` takes the raw client IP
 * and hashes it internally, so no caller can persist one by mistake.
 *
 * NEVER TOUCHES THE SECRET. The shared secret is not a parameter of anything in
 * this module, in any form — not raw, not hashed, not truncated.
 *
 * Dynamic imports keep Mongoose off this module's top level (so a test can stub
 * the whole function, and so importing it costs nothing). The type-only import
 * of the outcome union is erased at compile time and pulls in no runtime code.
 *
 * Pattern: `src/lib/support-chat/audit.ts:1-69`.
 */

import { createHash } from "node:crypto";
import type { BonusCodeCallOutcome } from "@/models/BonusCodeWebhookCall";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";
import { utcDayKey } from "./budget";

export type { BonusCodeCallOutcome };

/**
 * Is this a storable ObjectId?
 *
 * `userId` is typed as a string on the wire, and Mongoose CastErrors on a value
 * that is not a valid ObjectId — which would throw away the ENTIRE row, on
 * precisely the refusals this trail exists to make visible. A malformed id is
 * dropped from the row; the row itself still lands.
 */
function isObjectIdHex(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

/** sha256 hex of a string — mirrors `src/lib/support-chat/audit.ts:19-21`. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export interface BonusCodeWebhookCallMeta {
  /** Correlates the row with the `[bonus-code]` console.error lines for the same call. */
  requestId: string;
  outcome: BonusCodeCallOutcome;
  /** The HTTP status actually returned to Klaviyo. */
  status: number;
  /** Absent when the body never parsed (an `invalid_body` refusal). */
  trigger?: BonusCodeTrigger | null;
  /** Absent when no customer was resolved. Accepts a string or ObjectId. */
  userId?: string | null;
  /**
   * RAW client IP. Hashed here before storage — it is never persisted raw and
   * never logged. Pass it straight through; do not pre-hash.
   */
  ip?: string | null;
  durationMs?: number;
  /** Override for tests; defaults to the UTC day key of "now". */
  now?: Date;
}

/**
 * Write one `BonusCodeWebhookCall` row. Best-effort — catches everything and
 * resolves regardless, so a caller can `await` it without any risk of it
 * changing the response.
 *
 * `dayKey` is written with the SAME `utcDayKey` the budget gate counts on, so
 * the cap window and the audit window cannot drift apart.
 */
export async function writeBonusCodeWebhookCall(
  meta: BonusCodeWebhookCallMeta
): Promise<void> {
  try {
    const [{ default: connectDB }, { default: BonusCodeWebhookCall }] =
      await Promise.all([
        import("@/lib/mongodb"),
        import("@/models/BonusCodeWebhookCall"),
      ]);
    await connectDB();
    await BonusCodeWebhookCall.create({
      requestId: meta.requestId,
      dayKey: utcDayKey(meta.now ?? new Date()),
      outcome: meta.outcome,
      status: meta.status,
      ...(meta.trigger ? { trigger: meta.trigger } : {}),
      ...(isObjectIdHex(meta.userId) ? { userId: meta.userId } : {}),
      ...(meta.ip ? { ipHash: hashIp(meta.ip) } : {}),
      ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
    });
  } catch (err) {
    // Never rethrow. An audit failure must not fail the request.
    console.error("[bonus-code] writeBonusCodeWebhookCall failed:", err);
  }
}
