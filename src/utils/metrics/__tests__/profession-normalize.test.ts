import assert from "node:assert/strict";
import {
  normalizeProfession,
  bucketUnmatched,
} from "@/utils/metrics/profession-normalize";

function testEmptyAndNullAreUnknown() {
  assert.equal(normalizeProfession(undefined), "Unknown");
  assert.equal(normalizeProfession(null), "Unknown");
  assert.equal(normalizeProfession(""), "Unknown");
  assert.equal(normalizeProfession("   "), "Unknown");
}

function testCanonicalCaseInsensitive() {
  assert.equal(normalizeProfession("Electrician"), "Electrician");
  assert.equal(normalizeProfession("electrician"), "Electrician");
  assert.equal(normalizeProfession("  ELECTRICIAN  "), "Electrician");
}

function testTrailingPunctuationStripped() {
  assert.equal(normalizeProfession("electrician."), "Electrician");
  assert.equal(normalizeProfession("plumber!"), "Plumber");
  assert.equal(normalizeProfession("builder,"), "Builder");
  assert.equal(normalizeProfession("electrician.  "), "Electrician");
  assert.equal(normalizeProfession("  Plumber!  "), "Plumber");
}

function testPluralStripped() {
  assert.equal(normalizeProfession("Builders"), "Builder");
  assert.equal(normalizeProfession("plumbers"), "Plumber");
}

function testPluralOfSynonym() {
  assert.equal(normalizeProfession("sparkys"), "Electrician");
  assert.equal(normalizeProfession("chippies"), "Builder");
  assert.equal(normalizeProfession("brickies"), "Bricklayer");
}

function testSynonymMap() {
  assert.equal(normalizeProfession("sparky"), "Electrician");
  assert.equal(normalizeProfession("Sparkie"), "Electrician");
  assert.equal(normalizeProfession("electrcian"), "Electrician"); // common typo
  assert.equal(normalizeProfession("chippy"), "Builder");
  assert.equal(normalizeProfession("tradie"), "Builder");
  assert.equal(normalizeProfession("plumb"), "Plumber");
  assert.equal(normalizeProfession("brickie"), "Bricklayer");
  assert.equal(normalizeProfession("brick layer"), "Bricklayer");
  assert.equal(normalizeProfession("concretor"), "Concreter");
  assert.equal(normalizeProfession("fitter and turner"), "Fitter & Turner");
  assert.equal(normalizeProfession("fitter & turner"), "Fitter & Turner");
  assert.equal(normalizeProfession("auto mechanic"), "Mechanic");
  assert.equal(normalizeProfession("gardener"), "Landscaper");
}

function testUnmatchedFallsBackTitleCased() {
  assert.equal(normalizeProfession("Tiler"), "Tiler");
  assert.equal(normalizeProfession("tiler"), "Tiler");
  assert.equal(normalizeProfession("farm hand"), "Farm Hand");
  assert.equal(normalizeProfession("ROOFER"), "Roofer");
}

function testOtherIsCanonical() {
  // "Other" is a dropdown option — must stay distinct from "Other (custom)"
  assert.equal(normalizeProfession("Other"), "Other");
  assert.equal(normalizeProfession("other"), "Other");
}

function testBucketUnmatchedKeepsCanonicalAndTopN() {
  const counts: Record<string, number> = {
    Electrician: 50,
    Builder: 30,
    Plumber: 20,
    Other: 5, // canonical "Other" stays distinct
    Tiler: 10, // unmatched, top-N candidate
    Roofer: 8, // unmatched, top-N candidate
    Farmer: 6, // unmatched, top-N candidate
    Driver: 4, // unmatched, top-N candidate
    Painter: 12, // canonical
    Pilot: 3, // unmatched
    Chef: 2, // unmatched
    Nurse: 1, // unmatched (rolls into "Other (custom)")
  };
  const result = bucketUnmatched(counts, 5);

  // Canonical entries pass through unchanged
  assert.equal(result.Electrician, 50);
  assert.equal(result.Builder, 30);
  assert.equal(result.Plumber, 20);
  assert.equal(result.Painter, 12);
  assert.equal(result.Other, 5);

  // Top 5 unmatched (by count desc): Tiler 10, Roofer 8, Farmer 6, Driver 4, Pilot 3
  assert.equal(result.Tiler, 10);
  assert.equal(result.Roofer, 8);
  assert.equal(result.Farmer, 6);
  assert.equal(result.Driver, 4);
  assert.equal(result.Pilot, 3);

  // Rest summed into "Other (custom)" — Chef (2) + Nurse (1) = 3
  assert.equal(result["Other (custom)"], 3);

  // Original unmatched keys past top-N are removed
  assert.equal(result.Chef, undefined);
  assert.equal(result.Nurse, undefined);
}

function testBucketUnmatchedNoUnmatched() {
  const counts: Record<string, number> = { Electrician: 5, Builder: 3 };
  const result = bucketUnmatched(counts, 5);
  // deepEqual asserts the exact shape, which proves "Other (custom)" is absent.
  assert.deepEqual(result, { Electrician: 5, Builder: 3 });
}

function testBucketUnmatchedWithinTopN() {
  // Fewer unmatched than topN — all survive, no "Other (custom)" bucket created.
  const counts: Record<string, number> = { Electrician: 10, Tiler: 3, Roofer: 2 };
  const result = bucketUnmatched(counts, 5);
  assert.deepEqual(result, { Electrician: 10, Tiler: 3, Roofer: 2 });
}

testEmptyAndNullAreUnknown();
testCanonicalCaseInsensitive();
testTrailingPunctuationStripped();
testPluralStripped();
testPluralOfSynonym();
testSynonymMap();
testUnmatchedFallsBackTitleCased();
testOtherIsCanonical();
testBucketUnmatchedKeepsCanonicalAndTopN();
testBucketUnmatchedNoUnmatched();
testBucketUnmatchedWithinTopN();
console.log("profession-normalize tests passed");
