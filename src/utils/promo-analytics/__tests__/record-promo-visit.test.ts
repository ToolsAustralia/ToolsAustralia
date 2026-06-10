import assert from "node:assert/strict";
import {
  recordPromoVisit,
  type PromoVisitCapture,
  type PromoVisitDeps,
  type PromoVisitRecordPayload,
} from "../record-promo-visit";

type HasRecentArgs = Parameters<PromoVisitDeps["hasRecentVisit"]>[0];

function makeDeps(opts?: {
  duplicate?: boolean;
  recordResult?: { success: boolean; error?: string };
}): {
  deps: PromoVisitDeps;
  calls: { hasRecentVisit: HasRecentArgs[]; recordVisit: PromoVisitRecordPayload[] };
} {
  const calls = { hasRecentVisit: [] as HasRecentArgs[], recordVisit: [] as PromoVisitRecordPayload[] };
  const deps: PromoVisitDeps = {
    hasRecentVisit: async (args) => {
      calls.hasRecentVisit.push(args);
      return opts?.duplicate ?? false;
    },
    recordVisit: async (payload) => {
      calls.recordVisit.push(payload);
      return opts?.recordResult ?? { success: true };
    },
  };
  return { deps, calls };
}

const base: PromoVisitCapture = {
  pageType: "toolset",
  slug: "Milwaukee", // intentionally mixed-case to assert normalization behavior
  anonymousId: "anon-1",
  referrerHeader: "https://www.facebook.com/",
  url: "https://toolsaustralia.com.au/promotions/milwaukee?utm_source=facebook.com&utm_medium=cpc&utm_campaign=Draw7",
};

async function testDeduplicates() {
  const { deps, calls } = makeDeps({ duplicate: true });
  const out = await recordPromoVisit(base, deps);
  assert.deepEqual(out, { recorded: false, reason: "duplicate" }, "a duplicate visit should not record");
  assert.equal(calls.recordVisit.length, 0, "recordVisit must NOT be called on a duplicate");
  assert.equal(calls.hasRecentVisit[0]?.slug, "milwaukee", "dedup should query the normalized (lowercased) slug");
}

async function testSkipsDedupWithoutAnonymousId() {
  const { deps, calls } = makeDeps({ duplicate: true });
  const out = await recordPromoVisit({ ...base, anonymousId: undefined }, deps);
  assert.deepEqual(out, { recorded: true }, "should record when there is no anonymousId");
  assert.equal(calls.hasRecentVisit.length, 0, "dedup must be skipped without an anonymousId");
  assert.equal(calls.recordVisit.length, 1, "recordVisit should be called exactly once");
}

async function testUtmFallsBackToUrl() {
  const { deps, calls } = makeDeps();
  await recordPromoVisit({ ...base, anonymousId: undefined }, deps);
  const p = calls.recordVisit[0];
  assert.equal(p.utmSource, "facebook.com", "utmSource falls back to URL utm_source");
  assert.equal(p.utmMedium, "cpc", "utmMedium falls back to URL utm_medium");
  assert.equal(p.utmCampaign, "Draw7", "utmCampaign falls back to URL utm_campaign");
  assert.equal(p.slug, "Milwaukee", "raw slug is passed to recordVisit (the service lowercases on write)");
  assert.equal(p.pageType, "toolset", "pageType is passed through");
}

async function testBodyUtmWins() {
  const { deps, calls } = makeDeps();
  await recordPromoVisit({ ...base, anonymousId: undefined, utmSource: "klaviyo", utmCampaign: "newsletter" }, deps);
  const p = calls.recordVisit[0];
  assert.equal(p.utmSource, "klaviyo", "explicit body utmSource wins over URL");
  assert.equal(p.utmCampaign, "newsletter", "explicit body utmCampaign wins over URL");
  assert.equal(p.utmMedium, "cpc", "an unspecified body field still falls back to URL");
}

async function testFacebookCampaignIdFallback() {
  const { deps, calls } = makeDeps();
  await recordPromoVisit({ ...base, anonymousId: undefined, url: "https://x.com/p?campaign_id=12345" }, deps);
  assert.equal(calls.recordVisit[0].utmCampaign, "fb_12345", "campaign_id maps to fb_<id> when utm_campaign is absent");
}

async function testNoUtmCampaignWhenNonePresent() {
  const { deps, calls } = makeDeps();
  await recordPromoVisit({ ...base, anonymousId: undefined, url: "https://x.com/p" }, deps);
  assert.equal(calls.recordVisit[0].utmCampaign, undefined, "utmCampaign is undefined when nothing provides it");
}

async function testReferrerPassedThrough() {
  const { deps, calls } = makeDeps();
  await recordPromoVisit({ ...base, anonymousId: undefined }, deps);
  assert.equal(calls.recordVisit[0].referrer, "https://www.facebook.com/", "referrer header flows through parseReferrer");
}

async function testRecordFailureSurfaced() {
  const { deps } = makeDeps({ recordResult: { success: false, error: "Invalid promotion slug" } });
  const out = await recordPromoVisit({ ...base, anonymousId: undefined }, deps);
  assert.deepEqual(out, { recorded: false, reason: "Invalid promotion slug" }, "a recordVisit failure surfaces its reason");
}

async function run() {
  await testDeduplicates();
  await testSkipsDedupWithoutAnonymousId();
  await testUtmFallsBackToUrl();
  await testBodyUtmWins();
  await testFacebookCampaignIdFallback();
  await testNoUtmCampaignWhenNonePresent();
  await testReferrerPassedThrough();
  await testRecordFailureSurfaced();
  console.log("✅ record-promo-visit: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
