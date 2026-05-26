/**
 * Pulls per-adset metadata from Meta's Marketing API:
 * learning_stage_info, last_significant_edit, daily_budget, lifetime_budget,
 * and the parent campaign's objective. One paginated call per ad account.
 */

export interface AdsetMetadata {
  adsetId: string;
  campaignId: string | null;
  campaignObjective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  lastSignificantEdit: Date | null;
}

type MetaAdsetApiResponse = {
  data: Array<{
    id: string;
    daily_budget?: string;
    lifetime_budget?: string;
    learning_stage_info?: { status?: string };
    last_significant_edit?: { time?: string };
    campaign?: { id?: string; objective?: string };
  }>;
  paging?: { cursors?: { after?: string }; next?: string };
};

export async function fetchAdsetMetadata(
  adAccountId: string,
  accessToken: string,
): Promise<AdsetMetadata[]> {
  const fields = [
    "id",
    "daily_budget",
    "lifetime_budget",
    "learning_stage_info",
    "last_significant_edit",
    "campaign{id,objective}",
  ].join(",");

  // Intentionally NO effective_status filter — we want metadata for every adset
  // that appears in the insights window, including ones that are paused-by-parent,
  // recently archived, or campaign-paused. The aggregator joins this metadata by
  // adsetId, and any missing adset surfaces as "Unknown" status in the UI. A
  // narrow status filter here causes the UI to show UNKNOWN for every row.
  const results: AdsetMetadata[] = [];
  let url:
    | string
    | null = `https://graph.facebook.com/v19.0/${adAccountId}/adsets?fields=${fields}&limit=200&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error(`fetchAdsetMetadata failed: ${res.status} ${text}`);
      throw new Error(`Meta adsets API error: ${res.status}`);
    }
    const body: MetaAdsetApiResponse = await res.json();
    for (const item of body.data || []) {
      const status = item.learning_stage_info?.status;
      results.push({
        adsetId: item.id,
        campaignId: item.campaign?.id ?? null,
        campaignObjective: item.campaign?.objective ?? null,
        dailyBudgetCents: item.daily_budget ? parseInt(item.daily_budget, 10) : null,
        lifetimeBudgetCents: item.lifetime_budget ? parseInt(item.lifetime_budget, 10) : null,
        learningStatus:
          status === "LEARNING" || status === "SUCCESS" || status === "FAIL" ? status : null,
        lastSignificantEdit: item.last_significant_edit?.time
          ? new Date(item.last_significant_edit.time)
          : null,
      });
    }
    url = body.paging?.next ?? null;
  }

  return results;
}
