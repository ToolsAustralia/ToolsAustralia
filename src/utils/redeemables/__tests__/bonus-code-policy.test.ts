import {
  decideRearm,
  isCampaignRedeemable,
  personalWindowGoverns,
  type RearmInput,
} from "@/utils/redeemables/bonus-code-policy";

const NOW = new Date("2026-06-10T00:00:00.000Z");
const FUTURE = new Date("2026-06-24T13:59:59.999Z");
const PAST = new Date("2026-05-24T13:59:59.999Z");

let failures = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

const row = (over: Partial<RearmInput>): RearmInput => ({
  status: "active",
  expiresAt: FUTURE,
  redeemedEverAt: null,
  ...over,
});

console.log("decideRearm — the §3 decision table");

check("no row, with trigger", decideRearm(null, NOW, true), "minted");
check("no row, no trigger", decideRearm(null, NOW, false), "minted");

check("redeemed now", decideRearm(row({ status: "redeemed", redeemedEverAt: PAST }), NOW, true), "spent");
// The refunded case: status is restored to "active" and redeemedAt is $unset,
// so redeemedEverAt is the ONLY thing separating it from a fresh row.
check(
  "refunded (active again, but redeemedEverAt survives)",
  decideRearm(row({ status: "active", expiresAt: PAST, redeemedEverAt: PAST }), NOW, true),
  "spent"
);

check("active + unexpired, with trigger", decideRearm(row({}), NOW, true), "already_active");
check("active + unexpired, no trigger", decideRearm(row({}), NOW, false), "already_active");

check("expired + trigger", decideRearm(row({ expiresAt: PAST }), NOW, true), "rearmed");
check("expired, no trigger (wallet/cron)", decideRearm(row({ expiresAt: PAST }), NOW, false), "expired_no_rearm");

check("cancelled is terminal", decideRearm(row({ status: "cancelled" }), NOW, true), "spent");

// Boundary: the gate is strictly exclusive, so expiresAt === now is EXPIRED.
check("expiresAt exactly now", decideRearm(row({ expiresAt: NOW }), NOW, true), "rearmed");

// status:"expired" is never written by any code path — if one ever appears,
// it must still be handled by the expiresAt predicate, not by the status.
check(
  "legacy status:expired but future date",
  decideRearm(row({ status: "expired", expiresAt: FUTURE }), NOW, true),
  "already_active"
);

console.log("\npersonalWindowGoverns");

check("validForHours 0 -> false", String(personalWindowGoverns({ validForHours: 0 })), "false");
check("validForHours null -> false", String(personalWindowGoverns({ validForHours: null })), "false");
check("validForHours undefined -> false", String(personalWindowGoverns({ validForHours: undefined })), "false");
check("validForHours 1 -> true", String(personalWindowGoverns({ validForHours: 1 })), "true");
check("validForHours 72 -> true", String(personalWindowGoverns({ validForHours: 72 })), "true");

console.log("\nisCampaignRedeemable");

type Campaign = Parameters<typeof isCampaignRedeemable>[0];

const legacyCampaign = (over: Partial<Campaign>): Campaign => ({
  isActive: true,
  startsAt: PAST,
  endsAt: FUTURE,
  neverExpires: false,
  validForHours: null,
  ...over,
});

check("legacy campaign, open", String(isCampaignRedeemable(legacyCampaign({}), NOW)), "true");
check(
  "legacy campaign, ended (endsAt in past)",
  String(isCampaignRedeemable(legacyCampaign({ endsAt: PAST }), NOW)),
  "false"
);
check(
  "legacy campaign, neverExpires (no endsAt)",
  String(isCampaignRedeemable(legacyCampaign({ neverExpires: true, endsAt: null }), NOW)),
  "true"
);
check(
  "legacy campaign, inactive",
  String(isCampaignRedeemable(legacyCampaign({ isActive: false }), NOW)),
  "false"
);
check(
  "legacy campaign, not yet started",
  String(isCampaignRedeemable(legacyCampaign({ startsAt: FUTURE }), NOW)),
  "false"
);

const personalWindowCampaign = (over: Partial<Campaign>): Campaign => ({
  isActive: true,
  startsAt: PAST,
  endsAt: PAST, // endsAt already passed — must NOT veto a personal-window campaign
  neverExpires: false,
  validForHours: 72,
  ...over,
});

check(
  "personal-window campaign, endsAt passed but still redeemable",
  String(isCampaignRedeemable(personalWindowCampaign({}), NOW)),
  "true"
);
check(
  "personal-window campaign, inactive",
  String(isCampaignRedeemable(personalWindowCampaign({ isActive: false }), NOW)),
  "false"
);
check(
  "personal-window campaign, not yet started",
  String(isCampaignRedeemable(personalWindowCampaign({ startsAt: FUTURE }), NOW)),
  "false"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
