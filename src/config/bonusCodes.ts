/**
 * Per-customer bonus-entry codes — the trigger → campaign-code map.
 *
 * SINGLE SOURCE for the three campaign codes the eligibility triggers mint.
 * Every wiring site (cancel commit, one-time purchase without a membership,
 * guest checkout-start) reads its code from here so the strings are named in
 * exactly one place and cannot drift apart.
 *
 * A code listed here is only a LOOKUP KEY. `CampaignService.ensureCampaignIssuanceForUser`
 * resolves it against `MonthlyEntryCampaign`; if no active campaign carries the
 * code the call returns `not_applicable` and the trigger is a no-op. That is the
 * inert state — nothing here creates a campaign.
 *
 * @see src/utils/redeemables/bonus-code-policy.ts for `BonusCodeTrigger`
 * @see docs/rewards-redeemables/patterns.md for the trigger contract
 */
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

export const BONUS_CODE_BY_TRIGGER: Record<BonusCodeTrigger, string> = {
  "cancel-click": "BACKIN200",
  "checkout-start": "LOCKIN100",
  "one-time-purchase": "EXTRA100",
};
