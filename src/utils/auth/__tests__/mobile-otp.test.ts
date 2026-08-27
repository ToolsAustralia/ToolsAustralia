/**
 * Tests for the mobile OTP policy (`src/utils/auth/mobile-otp.ts`).
 *
 * Pure only — the rate-limit *claim* path talks to Mongo, so it is exercised via
 * the development bypass (which is itself the thing most worth pinning down: a
 * bypass that silently leaked into production would remove all spend protection).
 *
 * Run: npm run test:mobile-otp
 */

import assert from "node:assert/strict";
import {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_SENDS_PER_DAY,
  OTP_RESEND_COOLDOWN_SECONDS,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  getOtpExpiry,
  isOtpExpired,
  isOtpRateLimitBypassed,
  claimOtpSendAllowance,
  describeOtpRefusal,
} from "../mobile-otp";

/** Run `fn` with a temporary env, restoring whatever was there before. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const out = fn();
  if (out instanceof Promise) return out.finally(restore);
  restore();
  return Promise.resolve();
}

function testPolicyConstants() {
  assert.equal(OTP_EXPIRY_MINUTES, 10, "codes expire in 10 minutes");
  assert.equal(OTP_MAX_SENDS_PER_DAY, 3, "3 sends per day");
  assert.equal(OTP_RESEND_COOLDOWN_SECONDS, 60, "60s between sends");
}

function testCodeShapeAndKeyspace() {
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    const code = generateOtpCode();
    assert.match(code, /^\d{6}$/, `code must be exactly 6 digits, got "${code}"`);
    seen.add(code);
  }
  // Randomness sanity: 3000 draws from 10^6 should almost never repeat much.
  assert.ok(seen.size > 2900, `expected near-unique codes, got ${seen.size} distinct of 3000`);
}

function testLeadingZeroCodesAreProduced() {
  // REGRESSION GUARD: randomInt(100000, 999999) — the form this replaced — can
  // never emit a code starting with 0, discarding ~10% of the keyspace. If this
  // ever fails, someone reintroduced that bug.
  let sawLeadingZero = false;
  for (let i = 0; i < 20000 && !sawLeadingZero; i++) {
    if (generateOtpCode().startsWith("0")) sawLeadingZero = true;
  }
  assert.ok(sawLeadingZero, "codes beginning with 0 must be reachable");
}

async function testHashingIsKeyedAndVerifiable() {
  await withEnv({ NEXTAUTH_SECRET: "test-secret-a" }, () => {
    const hash = hashOtpCode("123456");
    assert.notEqual(hash, "123456", "the code must never be stored in plaintext");
    assert.match(hash, /^[0-9a-f]{64}$/, "expected a hex sha256 digest");
    assert.equal(verifyOtpCode("123456", hash), true, "correct code must verify");
    assert.equal(verifyOtpCode("123457", hash), false, "wrong code must not verify");
    assert.equal(verifyOtpCode("123456", null), false, "missing hash must not verify");
    assert.equal(verifyOtpCode("123456", ""), false, "empty hash must not verify");
  });
}

async function testHashIsSecretKeyed() {
  // The whole point of HMAC over plain sha256: the same code under a different
  // secret must produce a different digest, so a DB leak alone reveals nothing.
  let underA = "";
  let underB = "";
  await withEnv({ NEXTAUTH_SECRET: "secret-a" }, () => {
    underA = hashOtpCode("123456");
  });
  await withEnv({ NEXTAUTH_SECRET: "secret-b" }, () => {
    underB = hashOtpCode("123456");
  });
  assert.notEqual(underA, underB, "digest must depend on NEXTAUTH_SECRET, not just the code");

  // And a code hashed under one secret must not verify under another.
  await withEnv({ NEXTAUTH_SECRET: "secret-b" }, () => {
    assert.equal(verifyOtpCode("123456", underA), false, "cross-secret verification must fail");
  });
}

async function testHashingRefusesWithoutSecret() {
  await withEnv({ NEXTAUTH_SECRET: undefined }, () => {
    assert.throws(() => hashOtpCode("123456"), /NEXTAUTH_SECRET/, "must refuse to hash unkeyed");
    // verify must not throw — it degrades to "does not match".
    assert.equal(verifyOtpCode("123456", "deadbeef"), false, "verify must fail closed, not throw");
  });
}

function testExpiry() {
  const expiry = getOtpExpiry();
  const deltaMinutes = (expiry.getTime() - Date.now()) / 60000;
  assert.ok(deltaMinutes > 9.5 && deltaMinutes <= 10, `expiry should be ~10min, got ${deltaMinutes}`);

  assert.equal(isOtpExpired(null), true, "absent expiry counts as expired");
  assert.equal(isOtpExpired(undefined), true, "undefined expiry counts as expired");
  assert.equal(isOtpExpired(new Date(Date.now() - 1000)), true, "past expiry is expired");
  assert.equal(isOtpExpired(new Date(Date.now() + 60_000)), false, "future expiry is live");
}

async function testDevBypassRules() {
  // Production must ALWAYS enforce, whatever the env says.
  await withEnv({ NODE_ENV: "production", SMS_OTP_RATE_LIMIT_IN_DEV: undefined }, () => {
    assert.equal(isOtpRateLimitBypassed(), false, "production must never bypass");
  });
  await withEnv({ NODE_ENV: "production", SMS_OTP_RATE_LIMIT_IN_DEV: "false" }, () => {
    assert.equal(isOtpRateLimitBypassed(), false, "no env var may disable limiting in production");
  });
  // Development bypasses by default...
  await withEnv({ NODE_ENV: "development", SMS_OTP_RATE_LIMIT_IN_DEV: undefined }, () => {
    assert.equal(isOtpRateLimitBypassed(), true, "development bypasses by default");
  });
  // ...but can be forced on, so the limiter is testable locally.
  await withEnv({ NODE_ENV: "development", SMS_OTP_RATE_LIMIT_IN_DEV: "true" }, () => {
    assert.equal(isOtpRateLimitBypassed(), false, "SMS_OTP_RATE_LIMIT_IN_DEV=true re-enables it");
  });
}

async function testBypassedClaimIsUnlimitedAndReleaseIsSafe() {
  await withEnv({ NODE_ENV: "development", SMS_OTP_RATE_LIMIT_IN_DEV: undefined }, async () => {
    for (let i = 0; i < 10; i++) {
      const allowance = await claimOtpSendAllowance("dev-user");
      assert.equal(allowance.allowed, true, "dev bypass must never refuse");
      if (allowance.allowed) {
        // Releasing twice must not throw — routes call it on any failure path.
        await allowance.release();
        await allowance.release();
      }
    }
  });
}

function testRefusalCopy() {
  const cooldown = describeOtpRefusal({
    allowed: false,
    reason: "cooldown",
    retryAfterSeconds: 42,
    remainingToday: 2,
  });
  assert.ok(cooldown.includes("42 seconds"), `cooldown copy should name the wait: "${cooldown}"`);

  const daily = describeOtpRefusal({
    allowed: false,
    reason: "daily",
    retryAfterSeconds: 7200,
    remainingToday: 0,
  });
  assert.ok(daily.includes("2 hours"), `daily copy should name the wait: "${daily}"`);
  assert.ok(daily.includes("email"), "daily copy must offer the email fallback, not dead-end");

  // Rule 11: no gambling or entry-purchase framing in any customer-facing string.
  const banned = ["odds", "chance", "lottery", "raffle", "gamble", "bet ", "buy entries"];
  for (const copy of [cooldown, daily]) {
    for (const word of banned) {
      assert.ok(!copy.toLowerCase().includes(word), `copy must not contain "${word}": "${copy}"`);
    }
  }
}

async function run() {
  testPolicyConstants();
  testCodeShapeAndKeyspace();
  testLeadingZeroCodesAreProduced();
  await testHashingIsKeyedAndVerifiable();
  await testHashIsSecretKeyed();
  await testHashingRefusesWithoutSecret();
  testExpiry();
  await testDevBypassRules();
  await testBypassedClaimIsUnlimitedAndReleaseIsSafe();
  testRefusalCopy();
  console.log("✅ mobile-otp policy: all tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
