/**
 * bonus-code-webhook/budget.ts
 *
 * Fail-closed daily mint cap + break-glass kill switch for
 * POST /api/bonus-codes/v1/issue.
 *
 * WHY THIS IS THE IMPORTANT ONE. There is deliberately NO rate limiter on this
 * route (the spec rules it out explicitly): `createDistributedRateLimiter` fails
 * OPEN by design (`src/utils/security/rateLimiter.ts:130-134`) and
 * `createRateLimiter` is per-lambda and bypassable (`:77-87`), so neither is an
 * integrity control; and keying on IP would be actively harmful, because
 * Klaviyo calls from a shared egress pool, so every customer's flow would
 * collapse into one bucket. That makes this budget the ONLY control that still
 * bounds the damage once the shared secret leaks — and the realistic leak is
 * ordinary operations (a flow clone, an export, a screenshot, an off-boarded
 * marketer), not a breach.
 *
 * FAIL CLOSED, and mean it. Every error path — a Mongo outage, a bad env value,
 * an unexpected throw — returns `ok: false`. A catch block that returned
 * "allowed" would build a cap that uncaps itself at exactly the moment things
 * are going wrong. Pattern: `src/lib/support-chat/costGuard.ts:110-143`.
 *
 * WHAT IT COUNTS. Rows in `BonusCodeWebhookCall` for the current UTC day whose
 * outcome actually created or restarted a grant (`minted`, `rearmed`). It does
 * NOT count `RedeemableIssuance` rows: the legacy cron bulk-issues a campaign to
 * thousands of users in one run (`CampaignService.issueCampaignToUsers`), which
 * would exhaust the cap instantly and block the webhook for a whole day for a
 * completely legitimate reason.
 *
 * KNOWN, ACCEPTED IMPRECISIONS — documented so nobody rediscovers them later:
 *  - SOFT CAP. The audit row is written after the mint, so N concurrent calls
 *    can each read the same pre-mint count and each mint. The overshoot is
 *    bounded by concurrency, not unbounded. `costGuard` has the same property.
 *  - AUDIT-COUPLED. If an audit write fails (it is best-effort and never
 *    throws), that mint is not counted. Under-counting loosens the cap
 *    slightly; it never tightens it wrongly.
 *  - UTC DAY. The window resets at UTC midnight (10am/11am Sydney), matching the
 *    repo's existing `utcDayKey`. This is an abuse backstop, not a business
 *    metric — it only needs a well-defined boundary.
 */

// Type-only: erased at compile time, so the model (and Mongoose with it) never
// reaches this module's runtime top level. It exists so the subset below cannot
// drift out of the audit vocabulary without a compile error.
import type { BonusCodeCallOutcome } from "@/models/BonusCodeWebhookCall";

/**
 * UTC day key, YYYY-MM-DD.
 *
 * Same name and same semantics as `utcDayKey` in
 * `src/lib/support-chat/costGuard.ts:86-91`. Re-implemented rather than
 * imported ON PURPOSE: this is a security control and it must not acquire a
 * runtime dependency on the chatbot module, whose import graph can change for
 * reasons that have nothing to do with bonus codes.
 */
export function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The audit outcomes that consume daily budget — i.e. the ones where a customer
 * actually walked away with a live window. `already_active`, `spent`,
 * `expired_no_rearm`, `not_applicable` and every refusal handed out nothing, so
 * they must not eat the cap; otherwise an enumeration sweep over non-eligible
 * users could starve the legitimate flows.
 */
export const BUDGET_CONSUMING_OUTCOMES: readonly BonusCodeCallOutcome[] = [
  "minted",
  "rearmed",
];

/** Default cap when `BONUS_CODE_DAILY_MINT_CAP` is unset or unparseable. */
export const DEFAULT_DAILY_MINT_CAP = 500;

/** Fraction of the cap at which an early-warning line is written to the logs. */
const ALERT_THRESHOLD = 0.8;

export type BonusCodeBudgetVerdict =
  | { ok: true; mintedToday: number; dailyCap: number }
  /** Refused, but the day rolls over / the switch flips — a retry can succeed. */
  | { ok: false; status: 429; reason: "kill_switch" | "daily_cap" }
  /**
   * The gate itself could not be evaluated (DB outage, unexpected throw).
   * 500 rather than 429 because in the spec status map 500 is the status whose
   * retry actually recovers a grant that would otherwise be lost forever.
   */
  | { ok: false; status: 500; reason: "error" };

/** The subset `evaluateBonusCodeBudget` can return — it performs no I/O. */
export type BonusCodeBudgetDecision = Extract<
  BonusCodeBudgetVerdict,
  { ok: true } | { status: 429 }
>;

export interface BonusCodeBudgetDeps {
  /** Override to inject a stub in tests; defaults to the real audit-row count. */
  readMintedToday?: (dayKey: string) => Promise<number>;
  /** Override to inject a fixed "now" in tests. */
  now?: () => Date;
}

/**
 * Pure, synchronous decision — no I/O, fully unit-testable.
 * Priority: the kill switch wins over the cap.
 */
export function evaluateBonusCodeBudget(input: {
  killSwitch: boolean;
  mintedToday: number;
  dailyCap: number;
}): BonusCodeBudgetDecision {
  if (input.killSwitch) {
    return { ok: false, status: 429, reason: "kill_switch" };
  }
  if (input.mintedToday >= input.dailyCap) {
    return { ok: false, status: 429, reason: "daily_cap" };
  }
  return { ok: true, mintedToday: input.mintedToday, dailyCap: input.dailyCap };
}

/**
 * Read + validate `BONUS_CODE_DAILY_MINT_CAP`.
 *
 * An explicit `0` is honoured and means "mint nothing today" — a second
 * break-glass alongside the kill switch. A negative or unparseable value is a
 * typo, not an intent, so it falls back to the default and says so loudly,
 * rather than silently capping at zero (which would look like an outage) or at
 * infinity (which would be an uncapped mint endpoint).
 */
export function resolveDailyMintCap(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_MINT_CAP;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(
      "[bonus-code] BONUS_CODE_DAILY_MINT_CAP is not a non-negative integer — " +
        `falling back to ${DEFAULT_DAILY_MINT_CAP}.`
    );
    return DEFAULT_DAILY_MINT_CAP;
  }
  return parsed;
}

/** `BONUS_CODE_KILL_SWITCH=true` (any casing) stops all minting immediately. */
export function resolveKillSwitch(raw: string | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "true";
}

/**
 * The real count — separated so a test can replace it without a database.
 * Dynamic imports keep Mongoose off this module's top level.
 */
async function readMintedTodayFromDb(dayKey: string): Promise<number> {
  const [{ default: connectDB }, { default: BonusCodeWebhookCall }] =
    await Promise.all([
      import("@/lib/mongodb"),
      import("@/models/BonusCodeWebhookCall"),
    ]);
  await connectDB();
  return BonusCodeWebhookCall.countDocuments({
    dayKey,
    outcome: { $in: [...BUDGET_CONSUMING_OUTCOMES] },
  });
}

/**
 * DB-backed mint gate. Call it AFTER the secret check and BEFORE any mint.
 *
 * Fail-closed: any thrown error returns
 * `{ ok: false, status: 500, reason: "error" }`. A database outage must BLOCK
 * minting, never uncap it.
 */
export async function assertBonusCodeMintBudget(
  deps: BonusCodeBudgetDeps = {}
): Promise<BonusCodeBudgetVerdict> {
  try {
    const killSwitch = resolveKillSwitch(process.env.BONUS_CODE_KILL_SWITCH);
    const dailyCap = resolveDailyMintCap(process.env.BONUS_CODE_DAILY_MINT_CAP);

    const now = deps.now ? deps.now() : new Date();
    const dayKey = utcDayKey(now);

    const read = deps.readMintedToday ?? readMintedTodayFromDb;
    const mintedToday = await read(dayKey);

    const decision = evaluateBonusCodeBudget({ killSwitch, mintedToday, dailyCap });

    if (decision.ok && dailyCap > 0 && mintedToday >= dailyCap * ALERT_THRESHOLD) {
      // The "no alert" gap BUSINESS.md used to concede. console.error because
      // production strips log/info/debug/warn.
      console.error(
        `[bonus-code] daily mint budget at ${mintedToday}/${dailyCap} for ${dayKey} — approaching the cap.`
      );
    }
    if (!decision.ok) {
      console.error(
        `[bonus-code] mint refused by the budget gate (${decision.reason}) — ${mintedToday}/${dailyCap} for ${dayKey}.`
      );
    }

    return decision;
  } catch (err) {
    // FAIL CLOSED. Do not return ok:true here under any circumstance — a cap
    // that uncaps itself during an outage is not a cap.
    console.error("[bonus-code] budget gate failed — refusing to mint:", err);
    return { ok: false, status: 500, reason: "error" };
  }
}
