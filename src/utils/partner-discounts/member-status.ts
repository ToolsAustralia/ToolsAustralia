/**
 * iGoDirect member-status API — pure helpers for the vendor-facing read endpoint.
 *
 * `GET /api/partner-discount/member-status` is what the MyRewards portal calls at
 * SSO sign-in, page load, and offer redemption to read a member's LIVE
 * partner-discount access. Three pieces, all pure and unit-testable:
 *
 *  - `verifyMemberStatusBearer` — constant-time check of the vendor's static
 *    bearer secret (`IGODIRECT_MEMBER_STATUS_KEY`). Fails LOUD when the env var
 *    is unset (misconfigured → 500), never open.
 *  - `validateMemberId` — the `member_id` param is the SSO `member_id` (an opaque
 *    `User._id` string); reject malformed ids before they reach Mongoose so a
 *    cast error never decides the status code.
 *  - `buildMemberStatusResponse` — maps an `SsoAccessDecision` (the reconciled
 *    access engine's answer) to the agreed wire shape. The contract is FIXED
 *    (additive-only): `{ active, member_level, expires_at }`.
 *
 * See docs/partner/igodirect-member-status-api-plan.md §2–§5.
 *
 * @module utils/partner-discounts/member-status
 */

import { timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import type { SsoAccessDecision } from "@/utils/partner-discounts/sso-access";

/**
 * The vendor wire shape agreed with iGoDirect (plan §2). snake_case is the
 * contract, not a style slip. Extend ADDITIVELY only — never rename or remove.
 */
export interface MemberStatusResponse {
  /** Does the member have partner-discount access right now. */
  active: boolean;
  /**
   * Partner-catalog access % (5–100), or null. `null` while `active: true` is
   * the fail-closed tier anomaly — the caller must log it (vendor treats it as
   * minimal access). Always null when inactive.
   */
  member_level: number | null;
  /**
   * ISO-8601 UTC. Pack: the window end. Subscriber: the NEXT renewal date —
   * it rolls forward while subscribed, so the vendor must not treat it as a
   * hard stop. Null when inactive.
   */
  expires_at: string | null;
}

export type MemberStatusAuthVerdict =
  | { ok: true }
  | { ok: false; status: 401 | 500; reason: "unauthorized" | "misconfigured" };

/**
 * Constant-time bearer check against `IGODIRECT_MEMBER_STATUS_KEY`.
 *
 * Mirrors the length-check-then-`timingSafeEqual` in `src/lib/internal-norm/auth.ts`.
 * Unset/empty secret → `misconfigured` (route answers 500) — the endpoint must
 * never fail open because someone forgot an env var.
 */
export function verifyMemberStatusBearer(authorizationHeader: string | null): MemberStatusAuthVerdict {
  const expected = process.env.IGODIRECT_MEMBER_STATUS_KEY;
  if (!expected) {
    return { ok: false, status: 500, reason: "misconfigured" };
  }

  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const presented = match?.[1];
  if (!presented) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }

  try {
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
    ) {
      return { ok: false, status: 401, reason: "unauthorized" };
    }
  } catch {
    return { ok: false, status: 401, reason: "unauthorized" };
  }

  return { ok: true };
}

/**
 * Validate the `member_id` query param (the SSO `member_id` — an opaque
 * `User._id`). Returns the trimmed id when it is a well-formed Mongo ObjectId,
 * else null (route answers 400 `invalid_member_id`; 404 is reserved for
 * well-formed-but-unknown ids).
 */
export function validateMemberId(raw: string | null): string | null {
  const candidate = raw?.trim();
  if (!candidate || !mongoose.Types.ObjectId.isValid(candidate)) {
    return null;
  }
  return candidate;
}

/**
 * Map a reconciled `SsoAccessDecision` to the vendor wire shape. Pure — the
 * caller owns logging the `active && member_level === null` fail-closed anomaly.
 */
export function buildMemberStatusResponse(decision: SsoAccessDecision): MemberStatusResponse {
  if (!decision.hasAccess) {
    return { active: false, member_level: null, expires_at: null };
  }
  const expiresAt = decision.accessInfo.expiresAt;
  return {
    active: true,
    member_level: decision.memberLevel?.percent ?? null,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
}
