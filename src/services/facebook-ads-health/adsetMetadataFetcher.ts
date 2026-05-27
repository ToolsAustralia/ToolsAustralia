/**
 * Pulls per-adset metadata from Meta's Marketing API:
 * learning_stage_info, last_significant_edit, daily_budget, lifetime_budget,
 * and the parent campaign's objective. One paginated call per ad account.
 */

// effective_status reflects whether the adset is actually delivering. ACTIVE means
// the adset itself is running; CAMPAIGN_PAUSED / ADSET_PAUSED means a parent is paused;
// PAUSED means the adset is manually paused. Anything other than ACTIVE → not spending.
// Meta's raw effective_status values + two we DERIVE from other signals so
// our Live pill matches the "Delivery" column shown in Meta Ads Manager:
//   COMPLETED     — adset reached end_time, exhausted lifetime budget, or
//                   campaign budget cap — Meta UI's "Completed" state.
//   ADS_INACTIVE  — adset is ACTIVE but no child ads are delivering (signal:
//                   zero spend in trailing 7d). Matches Meta UI's "Ads
//                   inactive" badge for this exact case.
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
  | "COMPLETED"
  | "ADS_INACTIVE"
  | "UNKNOWN";

export interface AdsetMetadata {
  adsetId: string;
  campaignId: string | null;
  campaignObjective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  // Remaining budget cents (for lifetime budgets) — when 0 with a lifetime
  // budget configured, Meta marks the adset Completed.
  budgetRemainingCents: number | null;
  // Adset schedule end timestamp — when in the past, Meta marks the adset
  // Completed.
  endTime: Date | null;
  learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  // Meta's authoritative count toward the 50-event learning threshold. Populated
  // only when Meta exposes learning_stage_info — usually for adsets recently in
  // or just exited learning. When present, this is what Meta UI's Learning Phase
  // Progress popover displays. Prefer this over our self-computed count.
  learningStageConversions: number | null;
  // Meta's exact anchor timestamp for the learning counter (Unix seconds → Date).
  // When present, matches Meta UI's "Since last significant edit" timestamp
  // precisely (vs `lastSignificantEdit` which may differ if Meta uses a
  // different anchor internally).
  learningStageLastSigEditTs: Date | null;
  effectiveStatus: EffectiveStatus;
  lastSignificantEdit: Date | null;
  createdTime: Date | null;
}

type MetaAdsetApiResponse = {
  data: Array<{
    id: string;
    daily_budget?: string;
    lifetime_budget?: string;
    budget_remaining?: string;
    end_time?: string;
    effective_status?: string;
    learning_stage_info?: { status?: string; conversions?: number; last_sig_edit_ts?: number };
    // last_significant_edit shape varies in Meta's API. Documented as { time }
    // but in practice the value can arrive as:
    //   - { time: "2024-05-24T20:52:00+0000" }   <- documented object form
    //   - "2024-05-24T20:52:00+0000"             <- bare ISO string (seen in v21)
    //   - { time: 1716583920 }                   <- Unix seconds in some accounts
    //   - { time: "1716583920" }                 <- Unix seconds as string
    // Parser handles all of them — see parseEditTimestamp.
    last_significant_edit?: unknown;
    created_time?: string;
    campaign?: { id?: string; objective?: string };
  }>;
  paging?: { cursors?: { after?: string }; next?: string };
};

/**
 * Robust parser for Meta's last_significant_edit field — see comment on the
 * response type above for the four shapes we've seen in the wild. Returns
 * null on anything we can't interpret; logs unknown shapes once so we can
 * extend if Meta ever invents a fifth.
 */
function parseEditTimestamp(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  // Bare ISO string form
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  // Object with `.time` form
  if (typeof raw === "object" && raw !== null && "time" in raw) {
    const t = (raw as { time?: unknown }).time;
    if (typeof t === "string") {
      // Could be ISO or numeric-as-string (Unix seconds)
      const asNum = Number(t);
      if (!isNaN(asNum) && t.length <= 13) {
        // Numeric — treat as Unix seconds if 10 digits, ms if 13.
        return new Date(asNum > 1e12 ? asNum : asNum * 1000);
      }
      const d = new Date(t);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof t === "number") {
      return new Date(t > 1e12 ? t : t * 1000);
    }
  }
  return null;
}

// Only Meta's RAW values — COMPLETED/ADS_INACTIVE are derived later in the
// aggregator and shouldn't pass through normaliseEffectiveStatus.
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
    // budget_remaining + end_time drive the "Completed" delivery state.
    "budget_remaining",
    "end_time",
    "effective_status",
    "learning_stage_info{status,attribution_windows,conversions,last_sig_edit_ts}",
    "last_significant_edit",
    // created_time is the fallback "anchor" when last_significant_edit is null —
    // matches Meta UI behaviour which counts learning progress from creation
    // when no significant edit has happened.
    "created_time",
    "campaign{id,objective}",
  ].join(",");

  // Intentionally NO effective_status filter — we want metadata for every adset
  // that appears in the insights window, including ones that are paused-by-parent,
  // recently archived, or campaign-paused. The aggregator joins this metadata by
  // adsetId, and any missing adset surfaces as "Unknown" status in the UI.
  const results: AdsetMetadata[] = [];
  // Capture the first page's raw items so the diagnostic dump below can show
  // exactly what Meta is returning for last_significant_edit + learning_stage_info.
  let firstPageRaw: MetaAdsetApiResponse["data"] | null = null;
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
    if (firstPageRaw === null) firstPageRaw = body.data ?? [];
    for (const item of body.data || []) {
      const learningInfo = item.learning_stage_info;
      const status = learningInfo?.status;
      // last_sig_edit_ts is Unix seconds (Meta convention). 0 isn't a valid
      // edit timestamp here so we treat falsy as "absent".
      const sigEditTs =
        typeof learningInfo?.last_sig_edit_ts === "number" && learningInfo.last_sig_edit_ts > 0
          ? new Date(learningInfo.last_sig_edit_ts * 1000)
          : null;
      results.push({
        adsetId: item.id,
        campaignId: item.campaign?.id ?? null,
        campaignObjective: item.campaign?.objective ?? null,
        dailyBudgetCents: item.daily_budget ? parseInt(item.daily_budget, 10) : null,
        lifetimeBudgetCents: item.lifetime_budget ? parseInt(item.lifetime_budget, 10) : null,
        budgetRemainingCents: item.budget_remaining ? parseInt(item.budget_remaining, 10) : null,
        endTime: item.end_time ? new Date(item.end_time) : null,
        learningStatus:
          status === "LEARNING" || status === "SUCCESS" || status === "FAIL" ? status : null,
        learningStageConversions:
          typeof learningInfo?.conversions === "number" ? learningInfo.conversions : null,
        learningStageLastSigEditTs: sigEditTs,
        effectiveStatus: normaliseEffectiveStatus(item.effective_status),
        lastSignificantEdit: parseEditTimestamp(item.last_significant_edit),
        createdTime: item.created_time ? new Date(item.created_time) : null,
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
  const editBreakdown = {
    hasEdit: results.filter((r) => r.lastSignificantEdit !== null).length,
    hasCreatedTime: results.filter((r) => r.createdTime !== null).length,
    hasMetaAnchor: results.filter((r) => r.learningStageLastSigEditTs !== null).length,
    neither: results.filter((r) => r.lastSignificantEdit === null && r.createdTime === null).length,
  };
  console.error(
    `[adsetMetadataFetcher] fetched ${results.length} adsets — learning_stage_info breakdown: ${JSON.stringify(breakdown)} — anchor availability: ${JSON.stringify(editBreakdown)}`,
  );
  // Sample adsets that ACTUALLY have learning data — the first-3-regardless
  // version was picking paused/low-spend adsets where Meta returns nothing.
  // We want to see what shape Meta sends WHEN it sends learning_stage_info,
  // so we filter to those first.
  const withLearningInfo = (firstPageRaw ?? []).filter((it) => it.learning_stage_info);
  const withEditField = (firstPageRaw ?? []).filter((it) => it.last_significant_edit !== undefined);
  console.error(
    `[adsetMetadataFetcher] first-3 with learning_stage_info: ${JSON.stringify(withLearningInfo.slice(0, 3))}`,
  );
  console.error(
    `[adsetMetadataFetcher] first-3 with last_significant_edit: ${JSON.stringify(withEditField.slice(0, 3))}`,
  );
  // Distinct status values we received — surfaces the "unknown status" cases
  // (the 136 adsets that have last_sig_edit_ts but a status string we're
  // currently mapping to null).
  const distinctStatuses = new Set<string>();
  for (const it of firstPageRaw ?? []) {
    const s = it.learning_stage_info?.status;
    if (s != null) distinctStatuses.add(s);
  }
  console.error(
    `[adsetMetadataFetcher] distinct learning_stage_info.status values seen: ${JSON.stringify([...distinctStatuses])}`,
  );

  return results;
}
