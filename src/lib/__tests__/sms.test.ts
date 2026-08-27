/**
 * Tests for the Mobile Message SMS adapter (`src/lib/sms.ts`).
 *
 * Pure only — no network, no gateway credentials. The load-bearing thing under
 * test is `normaliseAuMobile`, because `User.mobile` is becoming a LOGIN
 * IDENTIFIER: a number that normalises differently in two places is a silent
 * lookup miss, i.e. a member who appears not to have an account.
 *
 * Run: npm run test:sms
 */

import assert from "node:assert/strict";
import { normaliseAuMobile, isValidAuMobile, toGatewayNumber, isSmsEnabled } from "../sms";

function testAcceptedInputForms() {
  // Every form a member, an admin, or a legacy DB row can present, all of which
  // must collapse to the SAME E.164 string.
  const equivalent = [
    "+61412345678",
    "61412345678",
    "0412345678",
    "412345678",
    "+61 412 345 678",
    "0412 345 678",
    "(04) 1234 5678",
    "0412-345-678",
  ];
  for (const input of equivalent) {
    assert.equal(normaliseAuMobile(input), "+61412345678", `should normalise "${input}"`);
  }
}

function testFivePrefixIsAccepted() {
  // REGRESSION: the old `formatMobileNumber` handled a bare 9-digit number
  // starting 4 but NOT 5, while the User pre-save hook handled both. A +615…
  // number therefore reached the gateway as "512345678" and could never deliver.
  assert.equal(normaliseAuMobile("512345678"), "+61512345678", "bare 9-digit 5-prefix");
  assert.equal(normaliseAuMobile("0512345678"), "+61512345678", "0-prefixed 5");
  assert.equal(normaliseAuMobile("+61512345678"), "+61512345678", "E.164 5-prefix");
}

function testRejectsNonAuMobiles() {
  const rejected: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "   ",
    "0312345678", // Melbourne landline (03) — not a mobile
    "0212345678", // Sydney landline
    "+14155550123", // US number
    "+447700900123", // UK mobile
    "041234567", // one digit short
    "04123456789", // one digit long
    "not a phone",
    "+61012345678", // 0 is not a valid mobile prefix
    "+61612345678", // 6 is not a valid mobile prefix
  ];
  for (const input of rejected) {
    assert.equal(normaliseAuMobile(input), null, `should reject ${JSON.stringify(input)}`);
    assert.equal(isValidAuMobile(input), false, `isValidAuMobile should reject ${JSON.stringify(input)}`);
  }
}

function testNormalisationIsIdempotent() {
  // Re-normalising stored data must be a no-op, or a backfill run twice corrupts it.
  const once = normaliseAuMobile("0412345678");
  assert.equal(normaliseAuMobile(once), once, "normalising twice must equal normalising once");
}

function testGatewayNumberFormat() {
  // Mobile Message accepts 0412345678 or 61412345678 but NOT a leading "+".
  assert.equal(toGatewayNumber("+61412345678"), "61412345678", "strips the leading +");
  assert.equal(toGatewayNumber("61412345678"), "61412345678", "already stripped is unchanged");
}

function testEnabledFlagIsStrictlyOptIn() {
  const original = process.env.SMS_ENABLED;
  try {
    for (const value of [undefined, "", "false", "1", "yes", "TRUE", "True"]) {
      if (value === undefined) delete process.env.SMS_ENABLED;
      else process.env.SMS_ENABLED = value;
      assert.equal(isSmsEnabled(), false, `SMS_ENABLED=${JSON.stringify(value)} must NOT enable sending`);
    }
    process.env.SMS_ENABLED = "true";
    assert.equal(isSmsEnabled(), true, 'only the exact string "true" enables sending');
  } finally {
    if (original === undefined) delete process.env.SMS_ENABLED;
    else process.env.SMS_ENABLED = original;
  }
}

function run() {
  testAcceptedInputForms();
  testFivePrefixIsAccepted();
  testRejectsNonAuMobiles();
  testNormalisationIsIdempotent();
  testGatewayNumberFormat();
  testEnabledFlagIsStrictlyOptIn();
  console.log("✅ sms adapter: all tests passed");
}

run();
