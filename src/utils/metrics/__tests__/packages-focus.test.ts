import assert from "node:assert/strict";
import {
  derivePackagesFocusFromUrl,
  derivePackagesFocusForDestination,
  resolvePrimaryRawUrl,
} from "../packages-focus";
import { canonicalizeLandingUrl } from "../canonicalize-landing-url";

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

/**
 * Multi-URL ads (2026-07-29). TikTok Smart+ `landing_page_url_list` is a genuine array of
 * DISTINCT promo pages, unlike Meta's carousel cards which usually share one destination.
 * When the URLs disagree on focus we must NOT inherit a verdict from array order.
 */
function testMultiUrlDisagreement() {
  const membership = "https://toolsaustralia.com.au/promotions/milwaukee";
  const oneTime = "https://toolsaustralia.com.au/promotions/makita?packages=one-time";

  assert.equal(
    derivePackagesFocusForDestination({ rawUrls: [membership, oneTime], canonicalUrl: canonicalizeLandingUrl(membership) }),
    "unclassified",
    "URLs disagreeing on focus => unclassified, never the first entry's verdict",
  );
  assert.equal(
    derivePackagesFocusForDestination({ rawUrls: [oneTime, membership], canonicalUrl: canonicalizeLandingUrl(oneTime) }),
    "unclassified",
    "disagreement is order-independent",
  );

  // Agreement must still classify — the guard must not make every multi-URL ad unclassified.
  assert.equal(
    derivePackagesFocusForDestination({
      rawUrls: [membership, "https://toolsaustralia.com.au/promotions/dewalt"],
      canonicalUrl: canonicalizeLandingUrl(membership),
    }),
    "membership",
    "two membership URLs still classify as membership",
  );
  assert.equal(
    derivePackagesFocusForDestination({
      rawUrls: [oneTime, "https://toolsaustralia.com.au/promotions/hikoki?packages=one-time"],
      canonicalUrl: canonicalizeLandingUrl(oneTime),
    }),
    "one-time",
    "two one-time URLs still classify as one-time",
  );

  // Real TikTok shape: same page, different utm/macro params — NOT a disagreement.
  const tt1 = "https://toolsaustralia.com.au/promotions/milwaukee-milwaukee?utm_source=TIKTOK&utm_id=__CAMPAIGN_ID__";
  const tt2 = "https://toolsaustralia.com.au/promotions/milwaukee-milwaukee?utm_source=TIKTOK&utm_content=__AID_NAME__";
  assert.equal(
    derivePackagesFocusForDestination({ rawUrls: [tt1, tt2], canonicalUrl: canonicalizeLandingUrl(tt1) }),
    "membership",
    "same page with differing utm/macro params is not a disagreement",
  );

  // A single URL is never a disagreement.
  assert.equal(
    derivePackagesFocusForDestination({ rawUrls: [oneTime], canonicalUrl: canonicalizeLandingUrl(oneTime) }),
    "one-time",
    "single URL classifies normally",
  );
}

function run() {
  testOneTimeParam();
  testMembershipDefault();
  testPrimaryRawUrlResolution();
  testDestinationClassification();
  testMultiUrlDisagreement();
  console.log("packages-focus tests passed");
}

run();
