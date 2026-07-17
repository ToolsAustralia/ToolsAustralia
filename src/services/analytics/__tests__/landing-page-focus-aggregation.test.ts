import assert from "node:assert/strict";
import { buildLandingPageDailyDocs } from "../SpendByUrlAggregationService";

const AD_ACCOUNT = "act_1";
const DATE = "2026-07-10";
const COMPUTED_AT = new Date("2026-07-11T00:00:00.000Z");

const URL_MAKITA = "https://toolsaustralia.com.au/promotions/makita";

function docs(insights: Parameters<typeof buildLandingPageDailyDocs>[0]["insights"], destByAd: Parameters<typeof buildLandingPageDailyDocs>[0]["destByAd"]) {
  return buildLandingPageDailyDocs({ adAccountId: AD_ACCOUNT, date: DATE, computedAt: COMPUTED_AT, insights, destByAd });
}

function testMixedFocusSameUrlRow() {
  // Two ads → same canonicalUrl, different focus (the reason the subdoc exists).
  const insights = [
    { adId: "a1", spendCents: 1000, impressions: 10, clicks: 2, conversions: 1, revenueCents: 5000 },
    { adId: "a2", spendCents: 300, impressions: 5, clicks: 1, conversions: 0, revenueCents: 0 },
  ];
  const destByAd = new Map([
    ["a1", { canonicalUrl: URL_MAKITA, rawUrls: [`${URL_MAKITA}?packages=one-time`] }],
    ["a2", { canonicalUrl: URL_MAKITA, rawUrls: [URL_MAKITA] }],
  ]);
  const out = docs(insights, destByAd);
  assert.equal(out.length, 1, "both ads share one canonicalUrl row");
  const row = out[0];
  assert.equal(row.canonicalUrl, URL_MAKITA);
  assert.equal(row.spendCents, 1300, "row totals unchanged by the split");
  assert.ok(row.packagesFocus, "resolved row carries the packagesFocus split");
  assert.equal(row.packagesFocus!["one-time"].spendCents, 1000);
  assert.equal(row.packagesFocus!.membership.spendCents, 300);
  assert.equal(
    row.packagesFocus!.membership.spendCents + row.packagesFocus!["one-time"].spendCents,
    row.spendCents,
    "focus subtotals must sum to row totals",
  );
  assert.equal(row.packagesFocus!["one-time"].revenueCents, 5000);
  assert.equal(row.packagesFocus!.membership.conversions, 0);
}

function testUnknownDestinationRowHasNoSplit() {
  const insights = [{ adId: "a9", spendCents: 700, impressions: 3, clicks: 1, conversions: 0, revenueCents: 0 }];
  // Meta couldn't resolve the creative → dest doc carries the unknown:// placeholder.
  const destByAd = new Map([["a9", { canonicalUrl: "unknown://meta-ad/a9", rawUrls: ["unknown://meta-ad/a9"] }]]);
  const out = docs(insights, destByAd);
  assert.equal(out.length, 1);
  assert.equal(out[0].canonicalUrl, "unknown://meta-ad/a9");
  assert.equal(out[0].packagesFocus, undefined, "unknown:// rows get NO split — they are the unclassified bucket");
}

function testMissingDestinationDoc() {
  // No dest doc at all (Graph API errored) — aggregation buckets under unknown:// itself.
  const insights = [{ adId: "a5", spendCents: 200, impressions: 1, clicks: 0, conversions: 0, revenueCents: 0 }];
  const out = docs(insights, new Map());
  assert.equal(out[0].canonicalUrl, "unknown://meta-ad/a5");
  assert.equal(out[0].packagesFocus, undefined);
}

function run() {
  testMixedFocusSameUrlRow();
  testUnknownDestinationRowHasNoSplit();
  testMissingDestinationDoc();
  console.log("landing-page focus aggregation tests passed");
}

run();
