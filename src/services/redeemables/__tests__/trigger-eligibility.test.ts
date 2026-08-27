/**
 * isUserEligibleForCampaign — the trigger-campaign targeting bypass.
 *
 * WHY THIS FILE EXISTS. The three eligibility triggers were first wired as
 * internal call sites, and it was proved at length that a failure at any of
 * them could not break its host flow. Nobody checked that the SUCCESS path
 * could fire at all — and it could not. Every stored-audience branch keys off
 * `hasActiveSubscription`:
 *
 *   - all-active-subscribers   ->  return hasActiveSubscription
 *   - dynamic-segment          ->  if (!hasActiveSubscription) return false
 *   - manual-users / csv-users ->  a pre-pinned id list, which by definition
 *                                  cannot contain someone who has not
 *                                  triggered yet
 *
 * ...while every trigger names a population that by definition holds no active
 * subscription: a one-time buyer who never joined (and who also fails the
 * `requiresEmailVerified` default of true, as does a guest who abandoned
 * checkout), and an ex-member whose cancellation is already committed —
 * `subscription.isActive` is `false` before anything downstream re-reads them.
 * All three returned `not_applicable` every time, forever, under every
 * targeting mode an admin can configure.
 *
 * THE MECHANISM MOVED; THE POPULATION DID NOT. The three call sites were
 * deleted on 2026-08-26. `trigger` now arrives as a string in the body of
 * `POST /api/bonus-codes/v1/issue`, which Klaviyo calls from inside the nurture
 * flow 2.5-17 days after the customer qualified. That changes WHEN the
 * relaxation fires, not WHO it must admit — which is why every fixture below
 * still describes a real caller. Grepping for the old call sites and finding
 * none is NOT evidence the relaxation is dead: remove it and every LOCKIN100 /
 * EXTRA100 webhook call returns `not_applicable` forever, silently.
 *
 * So this file pins that a trigger IS the targeting — AND, just as important,
 * that nothing changes when no trigger is passed, because the wallet read path
 * sweeps active campaigns on every load and must never self-enrol anyone.
 *
 * Pure: no DB, no network, no ambient clock (`now` is injected). The private
 * static is reached through a typed bracket cast — `private` is compile-time
 * only, and testing the real function beats testing a copy of it.
 */
import { CampaignService } from "../CampaignService";
import type { IMonthlyEntryCampaign } from "@/models/MonthlyEntryCampaign";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

const NOW = new Date("2026-08-25T04:00:00.000Z");
const STARTED = new Date("2026-08-01T00:00:00.000Z");
const ENDS_LATER = new Date("2026-12-31T00:00:00.000Z");

const USER_ID = "64b7f1c2e4b0a1a2b3c4d5e6";
const OTHER_ID = "64b7f1c2e4b0a1a2b3c4d5ff";

type EligibleUser = {
  _id: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  lastLogin?: Date;
  state?: string;
  subscription?: { isActive?: boolean; packageId?: string | null };
};

type EligibilityFn = (
  user: EligibleUser,
  campaign: IMonthlyEntryCampaign,
  now: Date,
  options?: { trigger?: BonusCodeTrigger }
) => Promise<boolean>;

const isEligible = (
  CampaignService as unknown as { isUserEligibleForCampaign: EligibilityFn }
).isUserEligibleForCampaign.bind(CampaignService);

let failures = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

/** A live campaign. `validForHours` is what makes it a TRIGGER campaign. */
const campaign = (over: Partial<IMonthlyEntryCampaign>): IMonthlyEntryCampaign =>
  ({
    isActive: true,
    startsAt: STARTED,
    endsAt: ENDS_LATER,
    neverExpires: false,
    targetingMode: "all-active-subscribers",
    ...over,
  }) as IMonthlyEntryCampaign;

/** A guest / ex-member: the population two of the three triggers fire for. */
const noSubscription: EligibleUser = { _id: USER_ID, isActive: true, isEmailVerified: false };
const member: EligibleUser = {
  _id: USER_ID,
  isActive: true,
  isEmailVerified: true,
  subscription: { isActive: true, packageId: "tradie" },
};
/** An ex-member with the cancellation already committed — where the win-back
 *  flow's population sits by the time its webhook call arrives, days later. */
const justCancelled: EligibleUser = {
  _id: USER_ID,
  isActive: true,
  isEmailVerified: true,
  subscription: { isActive: false, packageId: "tradie" },
};

async function run() {
  console.log("\nTHE CRITICAL — a trigger campaign admits the trigger's own population");

  check(
    "all-active-subscribers + trigger + NO subscription -> eligible",
    await isEligible(noSubscription, campaign({ validForHours: 72 }), NOW, { trigger: "one-time-purchase" }),
    true
  );
  check(
    "guest seconds after registering (no sub, unverified email) + trigger -> eligible",
    await isEligible(noSubscription, campaign({ validForHours: 72 }), NOW, { trigger: "checkout-start" }),
    true
  );
  check(
    "member who cancelled immediately (subscription.isActive false) + trigger -> eligible",
    await isEligible(justCancelled, campaign({ validForHours: 72 }), NOW, { trigger: "cancel-click" }),
    true
  );
  check(
    "dynamic-segment + trigger + no subscription + unverified email -> eligible",
    await isEligible(noSubscription, campaign({ validForHours: 72, targetingMode: "dynamic-segment" }), NOW, {
      trigger: "checkout-start",
    }),
    true
  );

  console.log("\nNO TRIGGER — the wallet sweep must behave exactly as it always has");

  // The pre-existing leak defence: a member opening /my-account sweeps active
  // campaigns. Without this, they would self-enrol and burn a lifetime grant.
  check(
    "trigger campaign + NO trigger + active member -> NOT eligible (leak defence intact)",
    await isEligible(member, campaign({ validForHours: 72 }), NOW),
    false
  );
  check(
    "trigger campaign + NO trigger + no subscription -> NOT eligible",
    await isEligible(noSubscription, campaign({ validForHours: 72 }), NOW),
    false
  );

  console.log("\nLEGACY CAMPAIGNS — untouched, with or without a trigger");

  // No validForHours => not a personal window => the bypass must not engage,
  // whatever is passed in options.
  check(
    "legacy campaign (no validForHours) + active member -> eligible, as before",
    await isEligible(member, campaign({}), NOW),
    true
  );
  check(
    "legacy campaign + no subscription -> NOT eligible, as before",
    await isEligible(noSubscription, campaign({}), NOW),
    false
  );
  check(
    "legacy campaign + a trigger passed -> trigger does NOT bypass (needs a personal window)",
    await isEligible(noSubscription, campaign({}), NOW, { trigger: "cancel-click" }),
    false
  );
  check(
    "legacy dynamic-segment + no subscription -> NOT eligible, as before",
    await isEligible(noSubscription, campaign({ targetingMode: "dynamic-segment" }), NOW),
    false
  );

  console.log("\nTHE WAIVER BOUNDARY — what a trigger waives, and what it does NOT");

  // RE-POINTED after the round-2 fix. This previously asserted `false` — that an
  // explicitly-set requiresEmailVerified still gated a trigger campaign. That was
  // wrong twice over: it never actually ran that way (the schema's `default: true`
  // made the old `?? !triggerIsTargeting` fallback unreachable, so EVERY trigger
  // campaign gated on verification, explicit or not), and it is not the intended
  // semantics. A trigger campaign waives the email-verified requirement outright —
  // checkout-start fires seconds after registration, so enforcing it excludes the
  // trigger's entire population. Verification is a proxy for "real customer"; the
  // trigger answers that question directly and better.
  check(
    "requiresEmailVerified is WAIVED under a trigger, even when explicitly true",
    await isEligible(
      noSubscription,
      campaign({
        validForHours: 72,
        targetingMode: "dynamic-segment",
        segmentConfig: { requiresEmailVerified: true },
      } as Partial<IMonthlyEntryCampaign>),
      NOW,
      { trigger: "checkout-start" }
    ),
    true
  );
  // ...and the other side of that boundary: WITHOUT a trigger the flag still gates
  // exactly as it always has. This is the byte-identical guarantee for the wallet
  // sweep and every pre-existing campaign.
  check(
    "requiresEmailVerified still gates a LEGACY campaign with no trigger",
    await isEligible(
      member, // active member, but isEmailVerified is false below
      campaign({
        targetingMode: "dynamic-segment",
        segmentConfig: { requiresEmailVerified: true },
      } as Partial<IMonthlyEntryCampaign>),
      NOW
    ),
    true // `member` IS verified — control case, proves the branch is reachable
  );
  check(
    "requiresEmailVerified refuses an UNVERIFIED user on a legacy campaign (no trigger)",
    await isEligible(
      { ...member, isEmailVerified: false },
      campaign({
        targetingMode: "dynamic-segment",
        segmentConfig: { requiresEmailVerified: true },
      } as Partial<IMonthlyEntryCampaign>),
      NOW
    ),
    false
  );
  check(
    "explicit excludeUserIds still excludes under a trigger",
    await isEligible(
      noSubscription,
      campaign({
        validForHours: 72,
        targetingMode: "dynamic-segment",
        segmentConfig: { excludeUserIds: [USER_ID] },
      } as Partial<IMonthlyEntryCampaign>),
      NOW,
      { trigger: "cancel-click" }
    ),
    false
  );
  check(
    "manual-users pins stay authoritative: unpinned user + trigger -> NOT eligible",
    await isEligible(
      noSubscription,
      campaign({
        validForHours: 72,
        targetingMode: "manual-users",
        segmentConfig: { includeUserIds: [OTHER_ID] },
      } as Partial<IMonthlyEntryCampaign>),
      NOW,
      { trigger: "cancel-click" }
    ),
    false
  );
  check(
    "manual-users pins stay authoritative: pinned user + trigger -> eligible",
    await isEligible(
      noSubscription,
      campaign({
        validForHours: 72,
        targetingMode: "manual-users",
        segmentConfig: { includeUserIds: [USER_ID] },
      } as Partial<IMonthlyEntryCampaign>),
      NOW,
      { trigger: "cancel-click" }
    ),
    true
  );
  check(
    "explicit membershipTiers still gate a trigger campaign",
    await isEligible(
      noSubscription,
      campaign({
        validForHours: 72,
        targetingMode: "dynamic-segment",
        segmentConfig: { membershipTiers: ["tradie"] },
      } as Partial<IMonthlyEntryCampaign>),
      NOW,
      { trigger: "one-time-purchase" }
    ),
    false
  );

  console.log("\nHARD STOPS — unchanged by the bypass");

  check(
    "deactivated ACCOUNT + trigger -> NOT eligible",
    await isEligible({ ...noSubscription, isActive: false }, campaign({ validForHours: 72 }), NOW, {
      trigger: "cancel-click",
    }),
    false
  );
  check(
    "campaign not yet started + trigger -> NOT eligible",
    await isEligible(
      noSubscription,
      campaign({ validForHours: 72, startsAt: new Date("2026-12-01T00:00:00.000Z") }),
      NOW,
      { trigger: "cancel-click" }
    ),
    false
  );
  check(
    "campaign past its minting backstop + trigger -> NOT eligible",
    await isEligible(
      noSubscription,
      campaign({ validForHours: 72, endsAt: new Date("2026-08-01T00:00:00.000Z") }),
      NOW,
      { trigger: "cancel-click" }
    ),
    false
  );
  check(
    "campaign switched off + trigger -> NOT eligible",
    await isEligible(noSubscription, campaign({ validForHours: 72, isActive: false }), NOW, {
      trigger: "cancel-click",
    }),
    false
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
