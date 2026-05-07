import assert from "node:assert/strict";
import { getAgeGroup, AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

const asOf = new Date("2026-05-04T00:00:00.000Z");

function testNullBirthdateIsUnknown() {
  assert.equal(getAgeGroup(null, asOf), "Unknown");
  assert.equal(getAgeGroup(undefined, asOf), "Unknown");
}

function testFutureBirthdateIsUnknown() {
  const future = new Date("2030-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(future, asOf), "Unknown");
}

function testUnder18IsUnknown() {
  // 17 years old as of asOf
  const dob = new Date("2009-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "Unknown");
}

function testBucket18To24Lower() {
  // exactly 18
  const dob = new Date("2008-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testBucket18To24Upper() {
  // 24 years old (just turned)
  const dob = new Date("2002-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testBucket25To34Lower() {
  // exactly 25
  const dob = new Date("2001-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "25-34");
}

function testBucket55To64() {
  const dob = new Date("1965-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "55-64");
}

function testBucket65Plus() {
  const dob = new Date("1955-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "65+");
}

function testCalendarMethodBeforeBirthdayInYear() {
  // Birthday hasn't happened yet this year — age should be 24, not 25.
  // asOf = 2026-05-04, dob = 2001-05-05 → 24 (one day before 25th birthday)
  const dob = new Date("2001-05-05T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testCalendarMethodOnBirthday() {
  // dob = 2001-05-04, asOf = 2026-05-04 → exactly 25 today
  const dob = new Date("2001-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "25-34");
}

function testLeapYearBirthdayCrossesBucket() {
  // DOB 2000-02-29. Feb 28, 2025 → age 24 (bucket "18-24").
  // Mar 1, 2025 → age 25 (bucket "25-34"). Verifies the leap-day crossover
  // and that the calendar-method correctly transitions on Mar 1 in non-leap years.
  const dob = new Date("2000-02-29T00:00:00.000Z");
  const beforeCrossover = new Date("2025-02-28T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, beforeCrossover), "18-24");
  const afterCrossover = new Date("2025-03-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, afterCrossover), "25-34");
}

function testJustBeforeEighteenIsUnknown() {
  // DOB 2008-05-05, asOf 2026-05-04 → age 17 (one day shy of 18th).
  const dob = new Date("2008-05-05T00:00:00.000Z");
  const dayBefore18th = new Date("2026-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, dayBefore18th), "Unknown");
  // Same DOB, asOf 2026-05-05 → exactly 18.
  const on18thBirthday = new Date("2026-05-05T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, on18thBirthday), "18-24");
}

function testBucket65BoundaryBothSides() {
  // age 64 → "55-64"; age 65 → "65+"
  const dob1 = new Date("1962-01-01T00:00:00.000Z"); // 64 as of asOf
  assert.equal(getAgeGroup(dob1, asOf), "55-64");
  const dob2 = new Date("1961-01-01T00:00:00.000Z"); // 65 as of asOf
  assert.equal(getAgeGroup(dob2, asOf), "65+");
}

function testAgeGroupOrderShape() {
  assert.deepEqual(AGE_GROUP_ORDER, [
    "18-24",
    "25-34",
    "35-44",
    "45-54",
    "55-64",
    "65+",
    "Unknown",
  ]);
}

testNullBirthdateIsUnknown();
testFutureBirthdateIsUnknown();
testUnder18IsUnknown();
testBucket18To24Lower();
testBucket18To24Upper();
testBucket25To34Lower();
testBucket55To64();
testBucket65Plus();
testCalendarMethodBeforeBirthdayInYear();
testCalendarMethodOnBirthday();
testLeapYearBirthdayCrossesBucket();
testJustBeforeEighteenIsUnknown();
testBucket65BoundaryBothSides();
testAgeGroupOrderShape();
console.log("age-grouping tests passed");
