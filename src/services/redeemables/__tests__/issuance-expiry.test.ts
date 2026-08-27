/**
 * resolveIssuanceExpiry — the single stamp site for a bonus-code issuance.
 *
 * Pure: no DB, no ambient clock. It decides a real prize-entry deadline, so the
 * whole precedence chain is pinned here:
 *   validForHours > neverExpires > campaign.endsAt > null
 *
 * The validForHours-beats-neverExpires case is the one that matters most: the two
 * are mutually exclusive at the zod boundary and in pre("save"), but if a row
 * ever carried both, a personal window must still win — silently stamping the
 * year-9999 sentinel would hand out a code that never expires.
 *
 * The window is an EXACT offset in hours from the issuing instant (the marketing
 * flow's webhook call), not a calendar-day snap to 23:59:59.999 Sydney. The old
 * "N is added to the CALENDAR date, so 1 means the rest of today plus one whole
 * day" off-by-one is meaningless under an exact offset and is deliberately not
 * ported — see expiryAfterHours in bonus-code-policy.ts.
 */
import { resolveIssuanceExpiry } from "../CampaignService";
import type { IMonthlyEntryCampaign } from "@/models/MonthlyEntryCampaign";
import { formatDateInAEST } from "@/utils/common/timezone";

type ExpiryCampaign = Pick<IMonthlyEntryCampaign, "validForHours" | "neverExpires" | "endsAt">;

const ISSUED_AT = new Date("2026-06-10T03:15:42.123Z"); // 13:15:42 Sydney, Wed 10 June (AEST)
const CAMPAIGN_ENDS_AT = new Date("2026-06-30T13:59:59.999Z");
const NEVER_EXPIRES_SENTINEL = "9999-12-31T23:59:59.999Z";

/** ISSUED_AT + 72h, on the timeline. 10 June 03:15:42.123Z -> 13 June 03:15:42.123Z. */
const PLUS_72H = "2026-06-13T03:15:42.123Z";

let failures = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

const campaign = (over: Partial<ExpiryCampaign>): ExpiryCampaign =>
  ({ neverExpires: false, endsAt: CAMPAIGN_ENDS_AT, ...over }) as ExpiryCampaign;

const stamp = (c: ExpiryCampaign): string => {
  const result = resolveIssuanceExpiry(c, ISSUED_AT);
  return result === null ? "null" : result.toISOString();
};

console.log("resolveIssuanceExpiry — precedence chain");

// 1. validForHours wins. Exactly 72h from the ISSUING INSTANT — no calendar
// rounding, no end-of-day snap. The sub-second component is carried through
// untouched; a `.setUTCSeconds(59, 999)` reappearing anywhere would break this.
check("validForHours set -> exact personal window", stamp(campaign({ validForHours: 72 })), PLUS_72H);
check(
  "validForHours label is the customer's local time, not 23:59",
  formatDateInAEST(resolveIssuanceExpiry(campaign({ validForHours: 72 }), ISSUED_AT) as Date, "yyyy-MM-dd HH:mm"),
  "2026-06-13 13:15"
);
// The offset is on the timeline, so a 1-hour window is exactly one hour later —
// there is no "rest of today plus one" calendar semantics to preserve.
check(
  "validForHours: 1 -> exactly one hour later",
  stamp(campaign({ validForHours: 1 })),
  "2026-06-10T04:15:42.123Z"
);

// 2. validForHours OUTRANKS neverExpires. Mutually exclusive upstream, but if both
// ever land on one row the personal window must still govern.
check(
  "validForHours wins over neverExpires",
  stamp(campaign({ validForHours: 72, neverExpires: true })),
  PLUS_72H
);
check(
  "validForHours wins over neverExpires even with no endsAt",
  stamp(campaign({ validForHours: 72, neverExpires: true, endsAt: undefined })),
  PLUS_72H
);

// 2b. The OPEN-ENDED trigger campaign — BACKIN200 / LOCKIN100 / EXTRA100 as the admin
// form now creates them: a 72h personal window with `endsAt` set to the far-future
// sentinel meaning "no minting backstop, issues until an admin switches it off".
// The open-ended backstop must NOT leak into the customer's deadline — the sentinel is
// the CAMPAIGN's clock, the 72 hours is the CUSTOMER's. If this ever stamped the sentinel
// the code would never expire, which is the exact outcome the 72h window exists to prevent.
check(
  "open-ended backstop (year-9999 endsAt) still yields the 72h personal window",
  stamp(campaign({ validForHours: 72, neverExpires: false, endsAt: new Date(NEVER_EXPIRES_SENTINEL) })),
  PLUS_72H
);

// 3. A validForHours below the >= 1 floor is NOT a personal window — it falls
// through, exactly as personalWindowGoverns defines it.
check("validForHours 0 -> falls through to endsAt", stamp(campaign({ validForHours: 0 })), CAMPAIGN_ENDS_AT.toISOString());
check(
  "validForHours undefined -> falls through to endsAt",
  stamp(campaign({ validForHours: undefined })),
  CAMPAIGN_ENDS_AT.toISOString()
);

// 4. neverExpires only -> the far-future sentinel.
check("neverExpires only -> sentinel", stamp(campaign({ neverExpires: true, endsAt: undefined })), NEVER_EXPIRES_SENTINEL);
check(
  "neverExpires outranks a set endsAt",
  stamp(campaign({ neverExpires: true, endsAt: CAMPAIGN_ENDS_AT })),
  NEVER_EXPIRES_SENTINEL
);

// 5. Legacy shared window.
check("endsAt only -> the campaign's shared deadline", stamp(campaign({})), CAMPAIGN_ENDS_AT.toISOString());

// 6. Nothing usable -> null. The caller must write NOTHING rather than persist an
// issuance with no deadline.
check("no validForHours, no neverExpires, no endsAt -> null", stamp(campaign({ endsAt: undefined })), "null");
check(
  "validForHours null (legacy nulled field) -> null when nothing else is set",
  stamp(campaign({ validForHours: null as unknown as undefined, endsAt: undefined })),
  "null"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
