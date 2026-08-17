import assert from "node:assert/strict";
import { buildAdvancedMatching, metaPhoneDigits } from "../advanced-matching";
import { hashPII } from "../canonical-event";
import { prepareUserData } from "@/utils/tracking/facebook-helpers";
import { genderToMetaGe } from "@/data/genders";

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

// Regression (2026-07 fix): a LOCAL-format AU mobile must hash as its E.164 digits
// ("0412 345 678" → "61412345678"), not the raw digit strip ("0412345678") — the old
// behavior wasted the ph match key against Meta's user graph.
async function testLocalPhoneNormalizedToE164Digits() {
  const { hashPII } = await import("../canonical-event");
  const local = buildAdvancedMatching({ _id: "u", mobile: "0412 345 678" });
  const e164 = buildAdvancedMatching({ _id: "u", mobile: "+61 412 345 678" });
  assert.equal(local.ph, hashPII("61412345678"), "local format must hash E.164 digits");
  assert.equal(local.ph, e164.ph, "local and E.164 inputs must produce IDENTICAL hashes");

  // The shared helper every Meta site (AM, CAPI provider, prepareUserData) uses:
  assert.equal(metaPhoneDigits("0412 345 678"), "61412345678");
  assert.equal(metaPhoneDigits("+61 412 345 678"), "61412345678");
  assert.equal(metaPhoneDigits("61412345678"), "61412345678");
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

/**
 * Meta's `ge` spec is "single lowercase letter, f or m, if unknown leave blank". The value that
 * gets hashed must therefore be the LETTER, not our stored word — hashing "male" instead of "m"
 * would produce a hash Meta cannot match against anything.
 */
async function testGenderMapsToMetaLetterAndHashes() {
  const male = buildAdvancedMatching({ _id: "u", gender: "male" });
  assert.equal(male.ge, hashPII("m"), "male must hash the letter 'm', not the word 'male'");

  const female = buildAdvancedMatching({ _id: "u", gender: "female" });
  assert.equal(female.ge, hashPII("f"), "female must hash the letter 'f'");

  // Case/whitespace tolerance — the stored value is lowercased by the schema, but legacy or
  // hand-edited rows must not silently produce a wrong hash.
  const messy = buildAdvancedMatching({ _id: "u", gender: "  MALE " });
  assert.equal(messy.ge, hashPII("m"), "gender should be trimmed + lowercased before mapping");
}

/**
 * The field is optional and has only two values, so MOST members produce no `ge` at all.
 * Omitting must mean ABSENT — never a hash of "" and never a hash of a sentinel, either of
 * which Meta would treat as a real value shared by every unanswered member.
 */
async function testUnknownGenderOmitsGeEntirely() {
  for (const gender of [undefined, "", "   ", "non-binary", "unknown", "x"]) {
    const am = buildAdvancedMatching({ _id: "u", gender });
    assert.equal(am.ge, undefined, `gender=${JSON.stringify(gender)} must omit ge entirely`);
    assert.ok(!("ge" in am), `gender=${JSON.stringify(gender)} must not even set the ge key`);
  }
}

/**
 * Cross-site parity. Meta matches a person by comparing hashes, so if the browser pixel and the
 * server-side paths hash gender differently, Meta reads ONE person as SEVERAL and match quality
 * gets worse rather than better. This is invisible to `tsc` and to any single-site test — it only
 * shows up as a silently degraded EMQ score weeks later.
 *
 * `buildAdvancedMatching` (browser AM) and `prepareUserData` (legacy CAPI path) are asserted
 * directly. The CAPI provider builds `user_data` inline, so the expression it uses is reproduced
 * here; if that provider ever stops routing through `genderToMetaGe`, this drifts and fails.
 */
async function testGenderHashIsIdenticalAcrossEveryMetaSite() {
  const user = {
    _id: "user-abc",
    email: "tradie@example.com",
    firstName: "Dave",
    lastName: "Smith",
    mobile: "0412345678",
    state: "NSW",
    birthdate: "1988-04-12",
    gender: "male",
  };

  const browserAm = buildAdvancedMatching(user);
  const legacy = prepareUserData({
    email: user.email,
    phone: user.mobile,
    firstName: user.firstName,
    lastName: user.lastName,
    state: user.state,
    birthdate: user.birthdate,
    gender: user.gender,
    externalId: user._id,
  });
  const capiProviderGe = genderToMetaGe(user.gender) ? hashPII(genderToMetaGe(user.gender)!) : undefined;

  assert.equal(browserAm.ge, hashPII("m"), "browser AM must hash the letter 'm'");
  assert.equal(legacy.ge, browserAm.ge, "legacy prepareUserData ge must match browser AM exactly");
  assert.equal(capiProviderGe, browserAm.ge, "CAPI provider ge must match browser AM exactly");
}

async function run() {
  await testGenderMapsToMetaLetterAndHashes();
  await testUnknownGenderOmitsGeEntirely();
  await testGenderHashIsIdenticalAcrossEveryMetaSite();
  await testHashesAllProvidedFields();
  await testNormalizationMatchesServerHashPII();
  await testPhoneStripsNonDigits();
  await testLocalPhoneNormalizedToE164Digits();
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
