import {
  decideRearm,
  expiryAfterHours,
  REARM_COOLDOWN_DAYS,
  type RearmInput,
} from "@/utils/redeemables/bonus-code-policy";
import { formatExpiryLabelAEST } from "@/utils/common/timezone";

let failures = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

console.log("expiryAfterHours — exact-offset arithmetic");

// ---------------------------------------------------------------------------
// +72h, no DST involved. Also proves NO second/millisecond rounding is
// applied (the guard against someone re-introducing `.setUTCSeconds(59,999)`):
// the source millisecond (.421) survives untouched in the result.
// ---------------------------------------------------------------------------
{
  const from = new Date("2026-06-10T13:47:33.421Z");
  const to = expiryAfterHours(from, 72);
  check("plain winter +72h — ISO instant", to.toISOString(), "2026-06-13T13:47:33.421Z");
  check("plain winter +72h — elapsed ms", String(to.getTime() - from.getTime()), "259200000");
  check("plain winter +72h — millisecond field preserved", String(to.getUTCMilliseconds()), "421");
  check(
    "plain winter +72h — label",
    formatExpiryLabelAEST(to),
    "Saturday 13 June 2026, 11:47PM AEST"
  );
}

// ---------------------------------------------------------------------------
// DST spring-forward (2026-10-04, Sydney clocks jump 2am -> 3am AEDT).
// The wall-clock hour LEGITIMATELY shifts by +1 across this boundary — that
// is correct behaviour for an exact duration, not a bug. The assertion that
// matters is the millisecond delta; the label is asserted too, but only to
// document the shift deliberately so nobody "fixes" it later.
// ---------------------------------------------------------------------------
{
  const from = new Date("2026-10-02T04:00:00.000Z"); // Fri 2 Oct 2026, 2:00pm AEST
  const to = expiryAfterHours(from, 72);
  check("DST spring-forward — ISO instant", to.toISOString(), "2026-10-05T04:00:00.000Z");
  check("DST spring-forward — elapsed ms is exactly 72h", String(to.getTime() - from.getTime()), "259200000");
  check(
    "DST spring-forward — wall-clock shifts +1h (3:00PM AEDT), this is correct",
    formatExpiryLabelAEST(to),
    "Monday 5 October 2026, 3:00PM AEDT"
  );
}

// ---------------------------------------------------------------------------
// DST fall-back (2026-04-05, Sydney clocks fall 3am -> 2am AEST).
// ---------------------------------------------------------------------------
{
  const from = new Date("2026-04-03T04:00:00.000Z"); // Fri 3 Apr 2026, 3:00pm AEDT
  const to = expiryAfterHours(from, 72);
  check("DST fall-back — ISO instant", to.toISOString(), "2026-04-06T04:00:00.000Z");
  check("DST fall-back — elapsed ms is exactly 72h", String(to.getTime() - from.getTime()), "259200000");
  check(
    "DST fall-back — wall-clock shifts -1h (2:00PM AEST), this is correct",
    formatExpiryLabelAEST(to),
    "Monday 6 April 2026, 2:00PM AEST"
  );
}

// ---------------------------------------------------------------------------
// Year rollover and leap day — elapsed time must still be exactly 72h.
// ---------------------------------------------------------------------------
{
  const from = new Date("2026-12-29T12:30:00.000Z");
  const to = expiryAfterHours(from, 72);
  check("year rollover — ISO instant", to.toISOString(), "2027-01-01T12:30:00.000Z");
  check("year rollover — elapsed ms", String(to.getTime() - from.getTime()), "259200000");
  check("year rollover — label", formatExpiryLabelAEST(to), "Friday 1 January 2027, 11:30PM AEDT");
}
{
  const from = new Date("2028-02-26T05:00:00.000Z");
  const to = expiryAfterHours(from, 72);
  check("leap day — ISO instant", to.toISOString(), "2028-02-29T05:00:00.000Z");
  check("leap day — elapsed ms", String(to.getTime() - from.getTime()), "259200000");
  check("leap day — label", formatExpiryLabelAEST(to), "Tuesday 29 February 2028, 4:00PM AEDT");
}

console.log("\nexpiryAfterHours — zero / negative / fractional guard");

// No special-casing: expiryAfterHours is pure arithmetic, nothing else. The
// `min: 1` floor lives on the Mongoose schema for `validForHours`, not here —
// this function must not silently reinterpret an input its caller already
// validated (or failed to).
{
  const from = new Date("2026-06-10T13:47:33.421Z"); // getTime() === 1781099253421

  check("zero hours — returns the same instant", String(expiryAfterHours(from, 0).getTime()), "1781099253421");
  check(
    "negative hours — moves the instant EARLIER by the same magnitude",
    String(expiryAfterHours(from, -1).getTime()),
    "1781095653421"
  );
  check(
    "fractional hours — a half hour is 30 real minutes, not rounded",
    String(expiryAfterHours(from, 0.5).getTime()),
    "1781101053421"
  );
}

console.log("\ndecideRearm — the re-arm cooldown (REARM_COOLDOWN_DAYS)");

check("REARM_COOLDOWN_DAYS default", String(REARM_COOLDOWN_DAYS), "30");

const NOW = new Date("2026-06-10T00:00:00.000Z");
const LAPSED = new Date("2026-05-24T00:00:00.000Z"); // well before NOW; any lapsed instant works

const row = (over: Partial<RearmInput>): RearmInput => ({
  status: "active",
  expiresAt: LAPSED,
  redeemedEverAt: null,
  ...over,
});

// --- No-trigger path must stay BYTE-IDENTICAL to before the cooldown existed.
// The rewards wallet calls decideRearm with hasTrigger: false on every page
// load; this must never change regardless of firstIssuedAt.
check(
  "no trigger, no firstIssuedAt — unchanged (expired_no_rearm)",
  decideRearm(row({}), NOW, false),
  "expired_no_rearm"
);
check(
  "no trigger, firstIssuedAt WAY outside cooldown — still expired_no_rearm (rule 3 short-circuits first)",
  decideRearm(row({}), NOW, false, new Date("2000-01-01T00:00:00.000Z")),
  "expired_no_rearm"
);
check(
  "no row, no trigger — unchanged (minted)",
  decideRearm(null, NOW, false),
  "minted"
);
check(
  "no row, with firstIssuedAt supplied — still minted (nothing to re-arm)",
  decideRearm(null, NOW, true, new Date("2026-06-01T00:00:00.000Z")),
  "minted"
);

// --- Existing 3-arg call sites keep compiling and keep their old behaviour:
// omitting the 4th arg entirely must behave as if there is no cooldown info.
check("3-arg call (no firstIssuedAt param at all) — trigger rearms as before", decideRearm(row({}), NOW, true), "rearmed");

// --- The point of this whole feature: a trigger is present (as the webhook
// ALWAYS supplies), but the grant was first issued recently — refuse.
check(
  "lapsed row, trigger present, firstIssuedAt 10 days ago — INSIDE cooldown, refused",
  decideRearm(row({}), NOW, true, new Date("2026-05-31T00:00:00.000Z")),
  "expired_no_rearm"
);

// --- Outside the cooldown, the trigger is honoured and the grant re-arms.
check(
  "lapsed row, trigger present, firstIssuedAt 31 days ago — OUTSIDE cooldown, rearmed",
  decideRearm(row({}), NOW, true, new Date("2026-05-10T00:00:00.000Z")),
  "rearmed"
);

// --- Boundary: exactly REARM_COOLDOWN_DAYS ago. Strictly exclusive on the
// END the same way rule 2 is strictly exclusive on expiresAt — at the exact
// instant the cooldown ends, the re-arm is already allowed.
check(
  "lapsed row, trigger present, firstIssuedAt EXACTLY 30 days ago — cooldown just ended, rearmed",
  decideRearm(row({}), NOW, true, new Date("2026-05-11T00:00:00.000Z")),
  "rearmed"
);

// --- redeemedEverAt must win over the cooldown, not the other way around —
// a spent grant is spent regardless of how recently it was first issued.
check(
  "redeemedEverAt set, firstIssuedAt inside cooldown — spent wins",
  decideRearm(row({ redeemedEverAt: new Date("2026-05-25T00:00:00.000Z") }), NOW, true, new Date("2026-05-31T00:00:00.000Z")),
  "spent"
);
check(
  "status cancelled, firstIssuedAt inside cooldown — spent wins",
  decideRearm(row({ status: "cancelled" }), NOW, true, new Date("2026-05-31T00:00:00.000Z")),
  "spent"
);

// --- A still-live window is unaffected by the cooldown regardless of trigger.
check(
  "active + unexpired, firstIssuedAt inside cooldown — already_active",
  decideRearm(row({ expiresAt: new Date("2026-06-24T00:00:00.000Z") }), NOW, true, new Date("2026-05-31T00:00:00.000Z")),
  "already_active"
);

// --- Missing firstIssuedAt falls back to issuedAt. The caller (a later task,
// CampaignService.ts per spec §2/C6) resolves `existing?.firstIssuedAt ??
// existing?.issuedAt` BEFORE calling this function — decideRearm has no
// notion of `issuedAt` at all and simply honours whatever Date it is handed
// as the 4th argument. This models a legacy row that never had
// `firstIssuedAt` set, where the caller has fallen back to its `issuedAt`:
{
  const legacyRowIssuedAt = new Date("2026-05-31T00:00:00.000Z"); // 10 days before NOW
  check(
    "legacy row (no firstIssuedAt; caller falls back to issuedAt) — still inside cooldown, refused",
    decideRearm(row({}), NOW, true, legacyRowIssuedAt),
    "expired_no_rearm"
  );
}
{
  const legacyRowIssuedAt = new Date("2026-04-01T00:00:00.000Z"); // > 30 days before NOW
  check(
    "legacy row (no firstIssuedAt; caller falls back to issuedAt) — outside cooldown, rearmed",
    decideRearm(row({}), NOW, true, legacyRowIssuedAt),
    "rearmed"
  );
}

// --- `firstIssuedAt: null` (explicit) behaves exactly like omitting it —
// no anchor, no cooldown, rule 3's answer stands.
check(
  "firstIssuedAt explicitly null — no cooldown info, trigger rearms",
  decideRearm(row({}), NOW, true, null),
  "rearmed"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
