/**
 * mintBonusCodeForTrigger — the service the Klaviyo webhook route delegates to.
 *
 * `POST /api/bonus-codes/v1/issue` is its only caller. Klaviyo fires that
 * webhook from inside a flow, immediately before the discount email, and this
 * is the orchestration that sits behind it: resolve the trigger's campaign,
 * mint (or re-arm) the customer's per-customer window, and email them when a
 * fresh deadline was actually stamped.
 *
 * It stays a service rather than being inlined into the handler because the
 * layering rule that caused it to be extracted in the first place applies
 * identically to the new route: a route handler must not orchestrate a
 * mint-and-email. The handler parses, authorizes, validates, delegates here,
 * maps the outcome to a status and audits — nothing else.
 *
 * Contract:
 *  - NEVER throws. The caller reads `outcome` and maps it to a status code.
 *  - Returns the `StampedIssuanceResult` verbatim, so the route can tell
 *    "nothing to do, do not retry" (`not_applicable`) apart from "the database
 *    blinked, please retry" (`error`). Collapsing those two permanently loses a
 *    customer's grant while the discount email is already in flight.
 *  - Notifies ONLY on `minted` / `rearmed`. That is also what keeps the
 *    LEGACY_MISSING_EXPIRY sentinel (epoch 0) away from a customer-facing date:
 *    it can only surface on `spent` / `expired_no_rearm`, neither of which emails.
 *  - `console.error` only — production builds strip log/info/debug/warn.
 *
 * @see docs/rewards-redeemables/api.md for the endpoint contract and status map
 */
import type { IUser } from "@/models/User";
import { CampaignService, type StampedIssuanceResult } from "./CampaignService";
import { BonusCodeNotifier } from "./BonusCodeNotifier";
import { BONUS_CODE_BY_TRIGGER } from "@/config/bonusCodes";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

/**
 * Enrol `user` in the bonus-code campaign for `trigger`, and email them if a
 * fresh deadline was actually stamped.
 *
 * Inert by default: with no active `MonthlyEntryCampaign` carrying the trigger's
 * code, `ensureCampaignIssuanceForUser` returns `not_applicable` and this is a
 * no-op. Under the webhook model that state is a launch-configuration error
 * rather than a benign default — the campaigns must exist BEFORE the Klaviyo
 * flows are switched on — so `CampaignService` logs it.
 */
export async function mintBonusCodeForTrigger(
  user: IUser,
  trigger: BonusCodeTrigger
): Promise<StampedIssuanceResult> {
  const userId = String(user._id);
  try {
    // THE production gate, covering BOTH effects — the Mongo write and the email.
    //
    // The webhook route asserts the same thing ahead of this call and answers
    // 403, so in practice this never fires. It is kept as the authoritative
    // backstop because it is the one that sits ahead of the MINT: Vercel
    // previews are PRODUCTION builds (CLAUDE.md), and dev/prod share one Klaviyo
    // account with no isolation on profile writes, so gating only the email
    // would still let a preview deploy write the issuance row and thereby BURN a
    // real customer's one-per-lifetime grant — they would later be told they had
    // already used a code they never saw.
    //
    // `not_applicable`, not `error`: nothing happened and a retry cannot change
    // that, so this must not be answered with a retryable status.
    // (BonusCodeNotifier keeps its own copy as an inner backstop for any future
    // direct caller of notify(); this is the authoritative one.)
    if (process.env.VERCEL_ENV !== "production") {
      console.error("[bonus-code] skipped mint+notify outside production", {
        userId,
        trigger,
        campaignCode: BONUS_CODE_BY_TRIGGER[trigger],
        vercelEnv: process.env.VERCEL_ENV,
      });
      return { outcome: "not_applicable" };
    }

    const result = await CampaignService.ensureCampaignIssuanceForUser({
      userId,
      campaignCode: BONUS_CODE_BY_TRIGGER[trigger],
      trigger,
    });

    if ((result.outcome === "minted" || result.outcome === "rearmed") && result.issuance) {
      // Awaited directly, with no wait budget. The budget that used to wrap this
      // existed solely because the mint was AWAITED on the customer's own
      // registration request and a 30s stall read to them exactly like a failed
      // signup. A webhook handler blocks nobody, so the ceiling bought nothing
      // and cost an "outcome unknown" marker on the row.
      try {
        await BonusCodeNotifier.notify({ user, issuance: result.issuance, trigger });
      } catch (error) {
        // The grant EXISTS at this point. A failed notify must not be reported
        // as a retryable error: the retry would come back `already_active`
        // anyway, and the outcome the route audits would be wrong.
        console.error("[bonus-code] notify threw", { userId, trigger, error });
      }
    }

    return result;
  } catch (error) {
    console.error(`[bonus-code] ${trigger} trigger failed`, { userId, error });
    return { outcome: "error" };
  }
}
