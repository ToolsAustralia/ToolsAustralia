/**
 * Policy for per-customer bonus-code issuances.
 *
 * Pure: no DB, no ambient clock. `now` is always injected so the DST and
 * boundary cases stay testable.
 */

/** The three moments that mint a per-customer bonus code. */
export type BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase";

export type RearmOutcome =
  | "minted"
  | "rearmed"
  | "already_active"
  | "spent"
  | "expired_no_rearm";

export interface RearmInput {
  status: "active" | "redeemed" | "expired" | "cancelled";
  expiresAt: Date;
  redeemedEverAt?: Date | null;
}

/**
 * Minimum number of days that must elapse after a customer's FIRST-ever
 * issuance (`firstIssuedAt`) before a lapsed grant may be re-armed again.
 *
 * Exists because the webhook caller always supplies a trigger, so rule 3 below
 * can no longer refuse anything on its own: a late retry, a flow re-entry, or
 * the marketing team re-running a flow would otherwise silently hand out a
 * second full window and a second email every time it fires. Under the old
 * end-of-day expiry model this was partly masked by accident — the notifier's
 * dedupe key is `issuanceId:expiresAtISO`, so two re-arms landing on the same
 * Sydney day collapsed into one email. An exact-hours expiry makes every
 * re-arm a distinct instant, so that incidental protection disappears; this
 * cooldown replaces it deliberately and visibly.
 */
export const REARM_COOLDOWN_DAYS = 30;

/**
 * Re-arm decision table for an existing (or missing) issuance row.
 *
 * Four rules are load-bearing:
 *  1. `redeemedEverAt` is the permanent "this grant is spent" marker. A refund
 *     restores status to "active" and $unsets redeemedAt, so WITHOUT this a
 *     refunded row is byte-identical to a never-redeemed one and "one grant per
 *     person, ever" silently becomes "one grant per refund cycle". Wins over
 *     EVERYTHING below, including the cooldown — a spent grant stays spent.
 *  2. The live-window test keys off `expiresAt`, NEVER off status "expired" —
 *     no code path in this repo writes that status, so a predicate matching it
 *     would match zero documents forever, silently.
 *  3. Re-arming requires an explicit trigger. The wallet read path calls the
 *     enrolment sweep on every load with `hasTrigger: false`; without this
 *     gate, opening /my-account would re-arm (and eventually burn) a lifetime
 *     grant. This rule alone is UNCHANGED and is checked before the cooldown,
 *     so the no-trigger outcome stays byte-identical regardless of `firstIssuedAt`.
 *  4. Even WITH a trigger, a re-arm is refused for `REARM_COOLDOWN_DAYS` after
 *     `firstIssuedAt` — see the constant above for why. The boundary is
 *     strictly exclusive on the cooldown END the same way rule 2 is strictly
 *     exclusive on `expiresAt`: at the instant the cooldown ends, the re-arm is
 *     already allowed. When `firstIssuedAt` is not supplied (a legacy row, or a
 *     caller with nothing to anchor on), there is nothing to enforce the
 *     cooldown against, so this rule is skipped and rule 3's `"rearmed"`
 *     stands. Callers are expected to fall back to the row's `issuedAt` when
 *     `firstIssuedAt` itself is absent — this function does not know about
 *     `issuedAt` at all, so that fallback happens before it is called.
 */
export function decideRearm(
  row: RearmInput | null,
  now: Date,
  hasTrigger: boolean,
  firstIssuedAt?: Date | null
): RearmOutcome {
  if (!row) return "minted";

  // Rule 1 — spent for life, regardless of the refund restoring status.
  if (row.redeemedEverAt) return "spent";
  if (row.status === "redeemed") return "spent";
  if (row.status === "cancelled") return "spent";

  // Rule 2 — the window is decided by the date, never by the status string.
  const live = row.expiresAt.getTime() > now.getTime();
  if (live) return "already_active";

  // Rule 3 — only an explicit trigger may restart a lapsed window. Checked
  // BEFORE the cooldown so the no-trigger path never depends on firstIssuedAt.
  if (!hasTrigger) return "expired_no_rearm";

  // Rule 4 — the cooldown. Only reachable once rule 3 has already let a
  // trigger through, which is precisely the case the webhook always hits.
  if (firstIssuedAt) {
    const cooldownEndsAt = firstIssuedAt.getTime() + REARM_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (now.getTime() < cooldownEndsAt) return "expired_no_rearm";
  }

  return "rearmed";
}

/**
 * Exact expiry offset for a per-customer bonus code.
 *
 * Epoch-millisecond arithmetic, deliberately. The predecessor — a calendar-day
 * helper in `src/utils/common/timezone.ts`, deleted with this change — added
 * CALENDAR days in Australia/Sydney and snapped to 23:59:59.999 local, because the
 * emailed deadline was a wall-clock time. Under the webhook model the deadline
 * is a DURATION from the instant Klaviyo called us, so the correct arithmetic
 * is the timeline, not the calendar.
 *
 * DST-safe BY CONSTRUCTION: DST is a property of the calendar projection of an
 * instant, not of the timeline itself, so millisecond arithmetic on two
 * instants cannot be affected by it no matter which side of a transition
 * either one falls on.
 *
 * TRADE, stated so nobody "fixes" it: duration-exact is NOT wall-clock-stable.
 * Across a Sydney DST transition the displayed time-of-day shifts by one hour
 * — a Fri 2:00pm AEST issue expires Mon 3:00pm AEDT. That is the OPPOSITE
 * trade from the old model, which pinned the wall clock and let the real
 * duration float between 13 and 15 days depending on which transition the
 * window straddled.
 *
 * DO NOT re-apply `.setUTCSeconds(59, 999)` here. That existed only because
 * `createAESTDateAsUTC` hardcodes seconds to `:00` and the redemption gate is
 * strictly exclusive (`expiresAt: { $gt: now }`), so a `23:59:00.000` bound
 * would kill the coupon 60 seconds before the emailed "11:59pm". An exact
 * offset is already millisecond-precise; re-applying that compensation would
 * silently make every window 72h + up to 59.999s.
 */
export function expiryAfterHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/**
 * True when the campaign hands each customer their own window, so the campaign's
 * own endsAt is a MINTING backstop rather than a redemption deadline.
 * Defined once and consumed at every truncation site so they cannot drift.
 */
export function personalWindowGoverns(campaign: { validForHours?: number | null }): boolean {
  return typeof campaign.validForHours === "number" && campaign.validForHours >= 1;
}

/**
 * Whether a campaign is open for REDEMPTION right now.
 *
 * isActive and startsAt always gate. endsAt gates only for legacy campaigns:
 * once a campaign hands out personal windows, its endsAt is a minting backstop,
 * and letting it veto here would cut short a deadline the customer was emailed.
 */
export function isCampaignRedeemable(
  campaign: {
    isActive: boolean;
    startsAt: Date;
    endsAt?: Date | null;
    neverExpires: boolean;
    validForHours?: number | null;
  },
  now: Date
): boolean {
  if (!campaign.isActive) return false;
  if (campaign.startsAt > now) return false;
  if (campaign.neverExpires) return true;
  if (personalWindowGoverns(campaign)) return true;
  return campaign.endsAt ? campaign.endsAt >= now : false;
}
