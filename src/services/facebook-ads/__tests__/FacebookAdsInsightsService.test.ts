import { strict as assert } from "node:assert";
import {
  FacebookAdsInsightsService,
  type FacebookAdsInsightsServiceInput,
} from "@/services/facebook-ads/FacebookAdsInsightsService";

async function run() {
  // Inject a fake fetcher so the test does not hit Facebook's API.
  const service = new FacebookAdsInsightsService({
    fetchInsights: async () => [
      {
        metrics: {
          spend: 10_000,
          revenue: 30_000,
          profit: 20_000,
          impressions: 1000,
          clicks: 100,
          linkClicks: 80,
          conversions: 5,
          landingPageView: 50,
          roas: 3,
          ctr: 10,
          cpc: 100,
          linkCtr: 8,
          linkCpc: 125,
          reach: 900,
          frequency: 1.11,
          cpmCents: 10_000,
        },
        breakdown: { campaignId: "C1", campaignName: "Camp" },
      },
    ],
    accessToken: "fake-token",
    adAccountId: "act_fake",
  });

  const input: FacebookAdsInsightsServiceInput = { dateRange: "today", level: "campaign" };
  const result = await service.getInsights(input);

  assert.equal(result.summary.spend, 100, "cents → dollars");
  assert.equal(result.summary.revenue, 300);
  assert.equal(result.summary.roas, 3);
  assert.equal(result.summary.linkClicks, 80, "linkClicks aggregated through");
  assert.equal(result.summary.linkCtr, 8, "linkCtr recomputed from totals");
  assert.equal(result.breakdown.length, 1);
  assert.equal(result.breakdown[0].campaignName, "Camp");
  assert.equal(result.breakdown[0].linkCpc, 1.25, "breakdown linkCpc cents → dollars");
  console.log("✓ FacebookAdsInsightsService aggregates + converts cents correctly");
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
