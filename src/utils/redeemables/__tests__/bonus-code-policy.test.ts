import {
  NEVER_EXPIRES_ISSUANCE_DATE,
  campaignExpiryShape,
  decideRearm,
  isCampaignRedeemable,
  isOpenEndedDate,
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

console.log("\ncampaignExpiryShape — must agree with resolveIssuanceExpiry's precedence");

check("nothing set -> fixed-end", campaignExpiryShape({}), "fixed-end");
check("neverExpires only -> never-expires", campaignExpiryShape({ neverExpires: true }), "never-expires");
check("validForHours only -> personal-window", campaignExpiryShape({ validForHours: 72 }), "personal-window");
// THE anti-drift assertion. The pair is rejected in all six guard sites, but if a row ever
// carried both, resolveIssuanceExpiry stamps the personal window — so the label the admin
// form shows must say "personal-window" too, or the form would promise a deadline the mint
// path does not honour.
check(
  "validForHours BEATS neverExpires, exactly as resolveIssuanceExpiry does",
  campaignExpiryShape({ validForHours: 72, neverExpires: true }),
  "personal-window"
);
check("validForHours 0 is below the >= 1 floor -> fixed-end", campaignExpiryShape({ validForHours: 0 }), "fixed-end");
check("validForHours null -> fixed-end", campaignExpiryShape({ validForHours: null }), "fixed-end");

console.log("\nisOpenEndedDate — a YEAR THRESHOLD, never an equality test");

// The LITERAL, not the constant. Feeding the implementation's own constant into the
// predicate that guards it cannot fail whatever either one becomes; pinning the literal
// separately means a change to the constant is caught too.
check("the sentinel's literal value", String(isOpenEndedDate("9999-12-31T23:59:59.999Z")), "true");
check(
  "NEVER_EXPIRES_ISSUANCE_DATE still IS that instant",
  NEVER_EXPIRES_ISSUANCE_DATE.toISOString(),
  "9999-12-31T23:59:59.999Z"
);
// A datetime-local picker parses its value as LOCAL time. East of UTC (Sydney) the
// round-tripped sentinel lands ~12h EARLIER in UTC but stays in 9999; west of UTC it rolls
// into 10000. An equality test would report "backstop in the year 9999" for both.
check("sentinel after a local-time picker round-trip", String(isOpenEndedDate(new Date("9999-12-31T23:59"))), "true");
// WEST of UTC the same round-trip rolls the instant into year 10000 outright — in Los
// Angeles `9999-12-31T23:59` local is `10000-01-01T07:59Z`. `>= 9999` catches it; a
// `getTime() === SENTINEL.getTime()` equality test would not.
const rolledPastYear9999 = new Date(Date.UTC(10000, 0, 1, 7, 59, 0, 0));
check("rolled past the year boundary (Date)", String(isOpenEndedDate(rolledPastYear9999)), "true");
// Its serialized form is EXPANDED ISO (`+010000-…`) — that is what a year-10000 Date
// round-trips through JSON as, and it must still be recognised.
check(
  "rolled past the year boundary (expanded ISO string)",
  String(isOpenEndedDate(rolledPastYear9999.toISOString())),
  "true"
);
// The plain 5-digit form is NOT valid ISO 8601 and `new Date` rejects it, so it is
// correctly treated as "not a date" rather than as an open-ended backstop.
check('unparseable 5-digit year "10000-01-01T04:59:00.000Z"', String(isOpenEndedDate("10000-01-01T04:59:00.000Z")), "false");
check("a real business date", String(isOpenEndedDate("2026-04-27T13:59:59.999Z")), "false");
check("null", String(isOpenEndedDate(null)), "false");
check("undefined", String(isOpenEndedDate(undefined)), "false");
check("empty string", String(isOpenEndedDate("")), "false");
check("unparseable", String(isOpenEndedDate("not-a-date")), "false");

console.log("\nthe open-ended trigger shape — the owner's campaign");

// endsAt = the open-ended sentinel, neverExpires false, 72h personal window. ONE fixture,
// three predicates — they must all agree about the same row, which is the only way this
// pins anything.
const openEndedTriggerCampaign: Campaign = {
  isActive: true,
  startsAt: PAST,
  endsAt: NEVER_EXPIRES_ISSUANCE_DATE,
  neverExpires: false,
  validForHours: 72,
};

check(
  "open-ended personal-window campaign is redeemable",
  String(isCampaignRedeemable(openEndedTriggerCampaign, NOW)),
  "true"
);
// THE MASS-MINT LOCK. src/app/api/cron/monthly-redeemables-issuance/route.ts filters on
// `campaign.monthKey === monthKey && !campaign.validForHours`. Dropping the backstop must
// not change that truthiness, or the monthly job would sweep this campaign into every
// active subscriber at once and burn a one-per-lifetime grant for people who did nothing.
// So apply BOTH the shared helper and the cron's own raw predicate to the SAME row above:
// if a future edit ever drops validForHours from the open-ended shape, both go red.
check(
  "personalWindowGoverns still true when open-ended",
  String(personalWindowGoverns(openEndedTriggerCampaign)),
  "true"
);
check(
  "the cron's raw !validForHours still excludes it from the monthly sweep",
  String(!openEndedTriggerCampaign.validForHours),
  "false"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
