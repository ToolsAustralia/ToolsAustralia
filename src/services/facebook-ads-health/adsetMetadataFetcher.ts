/**
 * Pulls per-adset metadata from Meta's Marketing API:
 * learning_stage_info, last_significant_edit, daily_budget, lifetime_budget,
 * and the parent campaign's objective. One paginated call per ad account.
 */

// effective_status reflects whether the adset is actually delivering. ACTIVE means
// the adset itself is running; CAMPAIGN_PAUSED / ADSET_PAUSED means a parent is paused;
// PAUSED means the adset is manually paused. Anything other than ACTIVE → not spending.
export type EffectiveStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "PREAPPROVED"
  | "PENDING_BILLING_INFO"
  | "CAMPAIGN_PAUSED"
  | "ARCHIVED"
  | "ADSET_PAUSED"
  | "IN_PROCESS"
  | "WITH_ISSUES"
  | "UNKNOWN";

export interface AdsetMetadata {
  adsetId: string;
  campaignId: string | null;
  campaignObjective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  effectiveStatus: EffectiveStatus;
  lastSignificantEdit: Date | null;
}

type MetaAdsetApiResponse = {
  data: Array<{
    id: string;
    daily_budget?: string;
    lifetime_budget?: string;
    effective_status?: string;
    learning_stage_info?: { status?: string };
    last_significant_edit?: { time?: string };
    campaign?: { id?: string; objective?: string };
  }>;
  paging?: { cursors?: { after?: string }; next?: string };
};

const KNOWN_EFFECTIVE_STATUSES: ReadonlySet<EffectiveStatus> = new Set([
  "ACTIVE", "PAUSED", "DELETED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED",
  "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ARCHIVED", "ADSET_PAUSED",
  "IN_PROCESS", "WITH_ISSUES",
]);

function normaliseEffectiveStatus(raw: string | undefined): EffectiveStatus {
  if (!raw) return "UNKNOWN";
  return KNOWN_EFFECTIVE_STATUSES.has(raw as EffectiveStatus) ? (raw as EffectiveStatus) : "UNKNOWN";
}

export async function fetchAdsetMetadata(
  adAccountId: string,
  accessToken: string,
): Promise<AdsetMetadata[]> {
  // Request learning_stage_info with explicit subfields. Meta's Graph API
  // sometimes returns less detail when an object field is requested bare; the
  // explicit `{status}` form is the documented way to guarantee the status comes
  // back. Bumped to v21.0 (current stable as of Q4 2024) — v19 is no longer
  // listed in Meta's supported versions and may be returning a stripped response.
  const fields = [
    "id",
    "daily_budget",
    "lifetime_budget",
    "effective_status",
    "learning_stage_info{status,attribution_windows,conversions,last_sig_edit_ts}",
    "last_significant_edit",
    "campaign{id,objective}",
  ].join(",");

  // Intentionally NO effective_status filter — we want metadata for every adset
  // that appears in the insights window, including ones that are paused-by-parent,
  // recently archived, or campaign-paused. The aggregator joins this metadata by
  // adsetId, and any missing adset surfaces as "Unknown" status in the UI.
  const results: AdsetMetadata[] = [];
  let url:
    | string
    | null = `https://graph.facebook.com/v21.0/${adAccountId}/adsets?fields=${fields}&limit=200&access_token=${accessToken}`;

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
        effectiveStatus: normaliseEffectiveStatus(item.effective_status),
        lastSignificantEdit: item.last_significant_edit?.time
          ? new Date(item.last_significant_edit.time)
          : null,
      });
    }
    url = body.paging?.next ?? null;
  }

  // Diagnostic — surfaces the actual distribution of learning_stage_info across
  // the account so we can tell whether "all Unknown" is a permissions issue, an
  // API-version issue, or genuinely just adsets that exited learning long ago
  // (Meta drops the field once the adset has been stable for a while).
  // console.error so it survives the production console strip (per CLAUDE.md).
  const breakdown = results.reduce(
    (acc, r) => {
      const k = r.learningStatus ?? "null";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.error(
    `[adsetMetadataFetcher] fetched ${results.length} adsets — learning_stage_info breakdown: ${JSON.stringify(breakdown)}`,
  );

  return results;
}
