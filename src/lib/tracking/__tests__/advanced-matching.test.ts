import assert from "node:assert/strict";
import { buildAdvancedMatching } from "../advanced-matching";

function isHexHash64(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function testHashesAllProvidedFields() {
  const am = buildAdvancedMatching({
    _id: "user-123",
    email: "Buyer@Example.COM",
    firstName: "Alice ",
    lastName: " Tester",
    mobile: "+61 4 1234 5678",
    state: "QLD",
    birthdate: "1990-06-15",
  });

  assert.ok(isHexHash64(am.em), "em should be sha256 hex");
  assert.ok(isHexHash64(am.fn), "fn should be sha256 hex");
  assert.ok(isHexHash64(am.ln), "ln should be sha256 hex");
  assert.ok(isHexHash64(am.ph), "ph should be sha256 hex");
  assert.ok(isHexHash64(am.st), "st should be sha256 hex");
  assert.ok(isHexHash64(am.db), "db should be sha256 hex");
  assert.ok(isHexHash64(am.country), "country should be sha256 hex");
  assert.ok(isHexHash64(am.external_id), "external_id should be sha256 hex");
}

async function testNormalizationMatchesServerHashPII() {
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({
    _id: "user-123",
    email: "Buyer@Example.COM",
  });
  const serverEm = hashPII("Buyer@Example.COM");
  assert.equal(am.em, serverEm, "browser AM em must equal server hashPII(email)");
}

async function testPhoneStripsNonDigits() {
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u", mobile: "+61 (4) 1234-5678" });
  const expected = hashPII("61412345678");
  assert.equal(am.ph, expected);
}

async function testBirthdateNormalizedToYYYYMMDD() {
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u", birthdate: "1990-06-15" });
  const expected = hashPII("19900615");
  assert.equal(am.db, expected);
}

async function testCountryDefaultsToAU() {
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u" });
  const expected = hashPII("au");
  assert.equal(am.country, expected);
}

async function testUndefinedFieldsAreDropped() {
  const am = buildAdvancedMatching({ _id: "u" });
  const keys = Object.keys(am);
  assert.deepEqual(
    keys.sort(),
    ["country", "external_id"].sort(),
    "undefined fields must not appear in result",
  );
}

async function testEmptyStringTreatedAsMissing() {
  const am = buildAdvancedMatching({
    _id: "u",
    email: "",
    firstName: "   ",
    lastName: "Real",
  });
  assert.equal(am.em, undefined, "empty email should be dropped");
  assert.equal(am.fn, undefined, "whitespace firstName should be dropped");
  assert.ok(am.ln, "non-empty lastName should be hashed");
}

async function run() {
  await testHashesAllProvidedFields();
  await testNormalizationMatchesServerHashPII();
  await testPhoneStripsNonDigits();
  await testBirthdateNormalizedToYYYYMMDD();
  await testCountryDefaultsToAU();
  await testUndefinedFieldsAreDropped();
  await testEmptyStringTreatedAsMissing();
  console.log("advanced-matching tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
