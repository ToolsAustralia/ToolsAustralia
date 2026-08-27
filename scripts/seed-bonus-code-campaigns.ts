/**
 * seed-bonus-code-campaigns — create the three per-customer bonus-code campaigns
 * that the Klaviyo flow webhook (`POST /api/bonus-codes/v1/issue`) mints against.
 *
 * DRY-RUN BY DEFAULT. Pass `--apply` to write. Add `--prod` to target production.
 *
 * WHY A SCRIPT AND NOT JUST THE ADMIN UI. The admin UI is a perfectly valid way to
 * create these, and it carries the StaffActivity audit trail this script does not.
 * What it cannot do is guarantee the `code` matches `BONUS_CODE_BY_TRIGGER`
 * character for character. That match is the single silent failure in the whole
 * feature: a trailing space or a lowercase letter and
 * `ensureCampaignIssuanceForUser` finds no campaign, returns `not_applicable`, the
 * endpoint answers **200**, Klaviyo sends the discount email anyway, and every
 * customer in the cohort gets a code refused at checkout. Nothing alerts. This
 * script reads the codes straight out of the config module, so they cannot drift.
 *
 * WHAT IT CREATES (one campaign per trigger):
 *
 *   trigger              code        entries  purpose
 *   ───────────────────  ──────────  ───────  ────────────────────────────────
 *   cancel-click         BACKIN200   200      member clicked cancel → win-back
 *   checkout-start       LOCKIN100   100      guest abandoned checkout
 *   one-time-purchase    EXTRA100    100      bought a pack, never joined
 *
 * THE THREE SETTINGS THAT ARE LOAD-BEARING, and what breaks without them:
 *
 *  1. `validForHours: 72` — this is NOT just the customer's deadline. It is the
 *     marker every mass-mint defence keys off: the monthly cron filters these
 *     campaigns out entirely (`api/cron/monthly-redeemables-issuance/route.ts`),
 *     `isUserEligibleForCampaign` treats the trigger as the targeting, and
 *     `issueCampaignToUsers` refuses a cron-issued personal-window campaign.
 *     Omit it and the cron would mass-mint to every active subscriber at once,
 *     burning a one-per-lifetime grant for people who did nothing.
 *
 *  2. `targetingMode: "all-active-subscribers"` — reads as "no extra filter" on a
 *     trigger campaign, NOT "members only". `isUserEligibleForCampaign` returns
 *     `triggerIsTargeting || hasActiveSubscription`, and a webhook mint always
 *     supplies a trigger, so it short-circuits true before membership is
 *     considered. That is what lets a GUEST (checkout-start) and a CANCELLED
 *     member (cancel-click) be minted to. The name is misleading; the behaviour
 *     is correct — but it depends on (1), so never clear `validForHours` on a
 *     live campaign.
 *
 *  3. `purchaseRequirement: "none"` — the customer applies the code AS they buy.
 *     Anything else makes it unredeemable at the checkout it was designed for. A
 *     cancel-click has no purchase to qualify on at all.
 *
 * `campaignMode: "global"` because the code is a shared string the marketing team
 * hardcodes into the email template. "unique"/"both" would mint a per-customer
 * code nobody ever sees.
 *
 * `endsAt` is a MINTING BACKSTOP, not the customer's deadline — once a campaign
 * hands out personal windows its own `endsAt` stops being a redemption deadline
 * (see `resolveIssuanceExpiry`). It is set to the open-ended sentinel
 * (`NEVER_EXPIRES_ISSUANCE_DATE`), which means the campaign has no minting backstop
 * and keeps issuing until an admin disables it in Admin → Monthly Coupons.
 * `neverExpires` stays FALSE — that flag means the coupons themselves never expire,
 * and these expire in 72 hours.
 *
 * IDEMPOTENT. `MonthlyEntryCampaign.code` is uniquely indexed; an existing
 * campaign for a code is reported and left completely untouched — this script
 * never updates or deletes. Re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/seed-bonus-code-campaigns.ts                    # dry run, dev
 *   npx tsx scripts/seed-bonus-code-campaigns.ts --apply            # write, dev
 *   npx tsx scripts/seed-bonus-code-campaigns.ts --prod             # dry run, PROD
 *   npx tsx scripts/seed-bonus-code-campaigns.ts --prod --apply     # write, PROD
 *
 * Exit codes: 0 ok · 1 fatal (connect / guard / validation) · 2 completed with errors.
 */

import path from "node:path";
import { config } from "dotenv";

// Load .env.local BEFORE connect-ops-db reads the URIs — tsx does not do this for us.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { connectOpsDb } from "./connect-ops-db";
import { BONUS_CODE_BY_TRIGGER } from "../src/config/bonusCodes";
import {
  NEVER_EXPIRES_ISSUANCE_DATE,
  type BonusCodeTrigger,
} from "../src/utils/redeemables/bonus-code-policy";

const APPLY = process.argv.includes("--apply");

/** The 72 hours the whole rework exists to deliver. Keep in step with Cobber FAQ id 86. */
const VALID_FOR_HOURS = 72;

/** Free entries each code includes. Entries are a free inclusion, never sold (rule 11). */
const ENTRIES_BY_TRIGGER: Record<BonusCodeTrigger, number> = {
  "cancel-click": 200,
  "checkout-start": 100,
  "one-time-purchase": 100,
};

const NAME_BY_TRIGGER: Record<BonusCodeTrigger, string> = {
  "cancel-click": "Bonus code — cancel win-back",
  "checkout-start": "Bonus code — abandoned checkout",
  "one-time-purchase": "Bonus code — one-time buyer",
};

/** Shown to the customer in the wallet. Rule 11: a free inclusion, never priced per entry. */
const LABEL_BY_TRIGGER: Record<BonusCodeTrigger, string> = {
  "cancel-click": "200 free entries",
  "checkout-start": "100 free entries",
  "one-time-purchase": "100 free entries",
};

function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main(): Promise<void> {
  const startsAt = new Date();
  const endsAt = NEVER_EXPIRES_ISSUANCE_DATE;

  await connectOpsDb("seed-bonus-code-campaigns");

  const { default: MonthlyEntryCampaign } = await import("../src/models/MonthlyEntryCampaign");

  const triggers = Object.keys(BONUS_CODE_BY_TRIGGER) as BonusCodeTrigger[];

  console.log("");
  console.log(`Seeding ${triggers.length} bonus-code campaigns · ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log(`  validForHours     ${VALID_FOR_HOURS}  (also the mass-mint defence marker)`);
  console.log(`  startsAt          ${startsAt.toISOString()}`);
  console.log(`  endsAt            ${endsAt.toISOString()}   ← open-ended sentinel: no minting backstop, issues until disabled`);
  console.log("");

  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const [i, trigger] of triggers.entries()) {
    const code = BONUS_CODE_BY_TRIGGER[trigger];
    const entriesAmount = ENTRIES_BY_TRIGGER[trigger];
    const prefix = `[${i + 1}/${triggers.length}] ${trigger} → ${code}`;

    // Guard: the config constant is the source of truth, but a bad edit there would
    // propagate here silently. The admin route's zod applies the same shape.
    if (!/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
      console.error(`${prefix} — ❌ code fails the campaign-code format (6-32 chars, A-Z 0-9, hyphen-separated). Fix src/config/bonusCodes.ts.`);
      failed += 1;
      continue;
    }

    try {
      const already = await MonthlyEntryCampaign.findOne({ code }).select("_id isActive validForHours").lean();
      if (already) {
        existing += 1;
        const warn =
          already.validForHours === VALID_FOR_HOURS
            ? ""
            : `  ⚠️  its validForHours is ${already.validForHours ?? "UNSET"} — expected ${VALID_FOR_HOURS}`;
        console.log(`${prefix} — already exists (${already.isActive ? "active" : "INACTIVE"}), left untouched.${warn}`);
        continue;
      }

      if (!APPLY) {
        console.log(`${prefix} — would create · ${entriesAmount} free entries · ${VALID_FOR_HOURS}h · purchaseRequirement "none"`);
        created += 1;
        continue;
      }

      await MonthlyEntryCampaign.create({
        monthKey: monthKeyOf(startsAt),
        name: NAME_BY_TRIGGER[trigger],
        displayLabel: LABEL_BY_TRIGGER[trigger],
        entriesAmount,
        campaignMode: "global",
        targetingMode: "all-active-subscribers",
        startsAt,
        endsAt,
        neverExpires: false,
        validForHours: VALID_FOR_HOURS,
        code,
        requiresPurchase: false,
        purchaseRequirement: "none",
        segmentConfig: {},
        isActive: true,
      });

      created += 1;
      console.log(`${prefix} — ✅ created · ${entriesAmount} free entries · ${VALID_FOR_HOURS}h`);
    } catch (err) {
      failed += 1;
      console.error(`${prefix} — ❌ failed:`, err);
    }
  }

  console.log("");
  console.log(`Done · ${APPLY ? "created" : "would create"} ${created} · already existed ${existing} · failed ${failed}`);
  if (!APPLY && created > 0) {
    console.log("Re-run with --apply to write. Add --prod to target production.");
  }
  if (APPLY && created > 0) {
    console.log("");
    console.log("NEXT: smoke-test ONE end to end before marketing publishes any flow.");
    console.log("      docs/rewards-redeemables/gotchas.md → launch order, step 3.");
    console.log("      A 200 from the endpoint does NOT prove a code was minted.");
  }

  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("❌ seed-bonus-code-campaigns fatal:", err);
  process.exit(1);
});
