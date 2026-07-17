import assert from "node:assert/strict";
import {
  derivePackagesFocusFromUrl,
  derivePackagesFocusForDestination,
  resolvePrimaryRawUrl,
} from "../packages-focus";

function testOneTimeParam() {
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=one-time"),
    "one-time",
    "packages=one-time must classify as one-time",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?utm_source=fb&packages=ONE-TIME "),
    "one-time",
    "value parsing must be case/whitespace tolerant (parseMembershipPackagesTab semantics)",
  );
}

function testMembershipDefault() {
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita"),
    "membership",
    "no packages param = membership (the default)",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=membership"),
    "membership",
    "explicit membership value still classifies membership (ads never use it, but must not break)",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=bogus"),
    "membership",
    "invalid packages value falls back to membership",
  );
  assert.equal(
    derivePackagesFocusFromUrl("not a url"),
    "membership",
    "unparseable string falls back to membership",
  );
}

function testPrimaryRawUrlResolution() {
  const rawUrls = [
    "https://toolsaustralia.com.au/promotions/ryobi?packages=one-time",
    "https://toolsaustralia.com.au/promotions/ryobi-milwaukee",
  ];
  assert.equal(
    resolvePrimaryRawUrl(rawUrls, "https://toolsaustralia.com.au/promotions/ryobi"),
    rawUrls[0],
    "primary = first rawUrl whose canonicalization matches canonicalUrl",
  );
  assert.equal(
    resolvePrimaryRawUrl(rawUrls, "https://toolsaustralia.com.au/nothing-matches"),
    rawUrls[0],
    "falls back to rawUrls[0] when nothing canonicalizes to canonicalUrl",
  );
  assert.equal(resolvePrimaryRawUrl([], "x"), undefined, "empty rawUrls resolves to undefined");
  assert.equal(resolvePrimaryRawUrl(null, "x"), undefined, "null rawUrls resolves to undefined");
}

function testDestinationClassification() {
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "https://toolsaustralia.com.au/promotions/makita",
      rawUrls: ["https://toolsaustralia.com.au/promotions/makita?packages=one-time"],
    }),
    "one-time",
    "resolved destination with one-time primary URL classifies one-time",
  );
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "https://toolsaustralia.com.au/promotions/makita",
      rawUrls: ["https://toolsaustralia.com.au/promotions/makita"],
    }),
    "membership",
    "resolved destination without the param classifies membership",
  );
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "unknown://meta-ad/1234",
      rawUrls: ["unknown://meta-ad/1234"],
    }),
    "unclassified",
    "unknown:// placeholder destinations are unclassified, never membership",
  );
  assert.equal(derivePackagesFocusForDestination(null), "unclassified", "missing destination doc is unclassified");
  assert.equal(
    derivePackagesFocusForDestination({ canonicalUrl: "https://x.com/a", rawUrls: [] }),
    "unclassified",
    "destination without any raw URL is unclassified",
  );
}

function run() {
  testOneTimeParam();
  testMembershipDefault();
  testPrimaryRawUrlResolution();
  testDestinationClassification();
  console.log("packages-focus tests passed");
}

run();
