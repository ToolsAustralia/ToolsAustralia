import { fetchFacebookAdInsightsDaily, processInsightData } from "@/lib/facebook-marketing";
import { fetchAdsetMetadata } from "@/services/facebook-ads-health/adsetMetadataFetcher";
import MetaAdInsightsDaily, { type IMetaAdInsightsDaily } from "@/models/MetaAdInsightsDaily";
import { subDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PURCHASE_CAPABLE_OBJECTIVES, type MetaAdInsightsRow, type LearningStatusBucket, type EffectiveStatusBucket } from "./types";

const AEST = "Australia/Sydney";

function bucketFromRaw(raw: string | null): LearningStatusBucket {
  if (raw === "SUCCESS") return "Active";
  if (raw === "LEARNING") return "Learning";
  if (raw === "FAIL") return "LearningLimited";
  return "Unknown";
}

export interface AggregatorInput {
  adAccountId: string;
  startDate: Date; // reporting window start
  endDate: Date;   // reporting window end
  level: "campaign" | "adset" | "ad";
  accessToken: string;
}

// Internal normalised row shape — same across Mongo and live-API paths.
type NormalisedRow = {
  adAccountId: string;
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  linkClicks: number;
  adsetBudgetCents: number | null;
  campaignObjective: string | null;
  learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  // Whether the parent adset is currently delivering. Sourced from Meta
  // metadata (NOT persisted in MetaAdInsightsDaily — historical adset state
  // isn't available from the Marketing API), so this is always "now" for
  // every day in the window.
  effectiveStatus: EffectiveStatusBucket;
  lastSignificantEdit: Date | null;
  // Fallback "anchor" for the learning-phase counter when no significant
  // edit exists — matches Meta UI which counts from creation in that case.
  createdTime: Date | null;
};

/**
 * Map a lean MetaAdInsightsDaily Mongo document into a NormalisedRow.
 * The document already has all fields parsed and stored as typed numbers/dates,
 * so this is essentially a shape-adapter. effectiveStatus is layered on from
 * the live metadata map because the historical adset delivery state isn't
 * available from the Marketing API — only the current state.
 */
function mongoToNormalised(
  doc: IMetaAdInsightsDaily,
  metadataByAdsetId: Map<string, { effectiveStatus: EffectiveStatusBucket; learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null; createdTime: Date | null }>,
): NormalisedRow {
  // Prefer LIVE metadata over Mongo snapshot for both effectiveStatus and
  // learningStatus. The Mongo value is captured at sync time and goes stale
  // immediately — for a UI badge that says "is this adset currently in
  // learning?", the only correct answer is the live API state. Falls back
  // to the Mongo value only if the live lookup misses the adset (deleted,
  // archived, or simply not in the active set returned by the metadata API).
  const meta = doc.adsetId ? metadataByAdsetId.get(doc.adsetId) : undefined;
  return {
    adAccountId: doc.adAccountId,
    date: doc.date,
    adId: doc.adId,
    adsetId: doc.adsetId,
    campaignId: doc.campaignId,
    campaignName: doc.campaignName,
    adsetName: doc.adsetName,
    adName: doc.adName,
    spendCents: doc.spendCents,
    impressions: doc.impressions,
    clicks: doc.clicks,
    conversions: doc.conversions,
    revenueCents: doc.revenueCents,
    linkClicks: doc.linkClicks,
    adsetBudgetCents: doc.adsetBudgetCents,
    campaignObjective: doc.campaignObjective,
    learningStatus: meta?.learningStatus ?? doc.learningStatus,
    effectiveStatus: meta?.effectiveStatus ?? "UNKNOWN",
    lastSignificantEdit: doc.lastSignificantEdit,
    createdTime: meta?.createdTime ?? null,
  };
}

/**
 * Transform a raw Meta API insight row into a NormalisedRow.
 * Parsing logic mirrors MetaInsightsSyncService to avoid drift.
 */
function rawToNormalised(
  raw: Parameters<typeof processInsightData>[0],
  metadataByAdsetId: Map<string, { dailyBudgetCents: number | null; lifetimeBudgetCents: number | null; campaignObjective: string | null; learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null; effectiveStatus: EffectiveStatusBucket; lastSignificantEdit: Date | null; createdTime: Date | null }>,
  adAccountId: string,
): NormalisedRow | null {
  const date = raw.date_start;
  if (!date || !raw.ad_id) return null;

  const metrics = processInsightData(raw);
  const meta = raw.adset_id ? metadataByAdsetId.get(raw.adset_id) : undefined;

  return {
    adAccountId,
    date,
    adId: raw.ad_id,
    adsetId: raw.adset_id,
    campaignId: raw.campaign_id,
    campaignName: raw.campaign_name,
    adsetName: raw.adset_name,
    adName: raw.ad_name,
    spendCents: metrics.spend,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    conversions: metrics.conversions,
    revenueCents: metrics.revenue,
    linkClicks: metrics.linkClicks,
    adsetBudgetCents: meta?.dailyBudgetCents ?? meta?.lifetimeBudgetCents ?? null,
    campaignObjective: meta?.campaignObjective ?? null,
    learningStatus: meta?.learningStatus ?? null,
    effectiveStatus: meta?.effectiveStatus ?? "UNKNOWN",
    lastSignificantEdit: meta?.lastSignificantEdit ?? null,
    createdTime: meta?.createdTime ?? null,
  };
}

export async function aggregateInsights(input: AggregatorInput): Promise<MetaAdInsightsRow[]> {
  const fbSince = formatInTimeZone(input.startDate, AEST, "yyyy-MM-dd");
  const fbUntil = formatInTimeZone(input.endDate, AEST, "yyyy-MM-dd");

  // Capture "now" once so all window boundaries are consistent within this call.
  const now = new Date();
  // Trailing-7 and prev-7 are both COMPLETE 7-day windows, ending YESTERDAY.
  // Today is partial-day spend/conv that biases everything low and triggers
  // false-negative SCALE/INVESTIGATE outcomes; exclude it from learning-window
  // math entirely. The reporting-window data (which DOES include today if the
  // user picked it) is computed separately from the inWindow filter below.
  //
  // Days numbered backwards from today=0:
  //   trailing-7 covers days -7..-1 (7 days, complete)
  //   prev-7     covers days -14..-8 (7 days, complete, immediately before)
  //   trailing-14 covers days -14..-1 (14 days, for last14dBestWeek scan)
  const yesterdayStr = formatInTimeZone(subDays(now, 1), AEST, "yyyy-MM-dd");
  const trailing7Start = formatInTimeZone(subDays(now, 7), AEST, "yyyy-MM-dd");
  const prev7Start = formatInTimeZone(subDays(now, 14), AEST, "yyyy-MM-dd");
  const prev7End = formatInTimeZone(subDays(now, 8), AEST, "yyyy-MM-dd");
  const trailing14Start = formatInTimeZone(subDays(now, 14), AEST, "yyyy-MM-dd");
  const todayStr = formatInTimeZone(now, AEST, "yyyy-MM-dd");

  // Pull a broad slice: from min(reportingStart, trailing14Start) to yesterday
  const earliest = fbSince < trailing14Start ? fbSince : trailing14Start;

  // Decide whether we need a live fetch for today's partial data.
  // Today is needed if: reporting window includes today, OR trailing-14 window touches today.
  // (trailing14Start <= todayStr is always true, so we also check fbUntil >= todayStr.)
  const needToday = fbUntil >= todayStr;

  // Run Mongo read, optional today live-fetch, and adset metadata in parallel.
  const [mongoRows, rawTodayInsights, adsetMetadataList] = await Promise.all([
    // Past days: fast indexed Mongo read (excludes today)
    MetaAdInsightsDaily.find({
      adAccountId: input.adAccountId,
      date: { $gte: earliest, $lte: yesterdayStr },
    }).lean() as unknown as Promise<IMetaAdInsightsDaily[]>,

    // Today: live-fetch only if needed (small payload, ~1 sec)
    needToday
      ? fetchFacebookAdInsightsDaily(input.adAccountId, input.accessToken, {
          since: todayStr,
          until: todayStr,
        })
      : Promise.resolve([]),

    // Adset metadata: always live (learning status and last_significant_edit change intraday)
    fetchAdsetMetadata(input.adAccountId, input.accessToken),
  ]);

  // Diagnostic: log payload sizes to surface zero-data / caching issues.
  // Uses console.error so it survives production console-stripping (per CLAUDE.md).
  console.error(
    `[facebook-ads-health/aggregator] mongoRows=${mongoRows.length} todayRows=${rawTodayInsights.length} adsetMetadata=${adsetMetadataList.length} window=${earliest}..${todayStr} (today=${needToday})`,
  );

  // Build a lookup map for adset metadata keyed by adset ID.
  // Narrow to adsets that actually appear in the mongo results or today's live rows
  // to avoid holding the full account history in memory.
  const mongoAdsetIds = new Set(
    mongoRows.map((r) => r.adsetId).filter((id): id is string => Boolean(id)),
  );
  const todayAdsetIds = new Set(
    rawTodayInsights.map((r) => r.adset_id).filter((id): id is string => Boolean(id)),
  );
  const insightsAdsetIds = new Set([...mongoAdsetIds, ...todayAdsetIds]);
  const metadataByAdsetId = new Map(
    adsetMetadataList
      .filter((m) => insightsAdsetIds.has(m.adsetId))
      .map((m) => [m.adsetId, m]),
  );

  // Combine Mongo past rows + live today rows into a single NormalisedRow array.
  const rows: NormalisedRow[] = [
    ...mongoRows.map((doc) => mongoToNormalised(doc, metadataByAdsetId)),
    ...rawTodayInsights
      .map((raw) => rawToNormalised(raw, metadataByAdsetId, input.adAccountId))
      .filter((r): r is NormalisedRow => r !== null),
  ];

  // Group by level
  const groupKey = (r: NormalisedRow): string => {
    if (input.level === "campaign") return r.campaignId ?? "(none)";
    if (input.level === "adset") return r.adsetId ?? "(none)";
    return r.adId;
  };

  const groups = new Map<string, NormalisedRow[]>();
  for (const r of rows) {
    const k = groupKey(r);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  const result: MetaAdInsightsRow[] = [];
  for (const [id, groupRows] of groups) {
    const first = groupRows[0];
    if (!first) continue;
    const inWindow = groupRows.filter((r) => r.date >= fbSince && r.date <= fbUntil);
    // Both windows are COMPLETE 7-day spans ending yesterday — see header comment.
    const in7 = groupRows.filter((r) => r.date >= trailing7Start && r.date <= yesterdayStr);
    const inPrev7 = groupRows.filter((r) => r.date >= prev7Start && r.date <= prev7End);

    const sum = (arr: NormalisedRow[], key: "spendCents" | "conversions" | "revenueCents" | "linkClicks" | "impressions") =>
      arr.reduce((s, r) => s + (r[key] ?? 0), 0);

    const windowTotals = {
      spendCents: sum(inWindow, "spendCents"),
      conversions: sum(inWindow, "conversions"),
      revenueCents: sum(inWindow, "revenueCents"),
      linkClicks: sum(inWindow, "linkClicks"),
      impressions: sum(inWindow, "impressions"),
    };
    const last7 = {
      spendCents: sum(in7, "spendCents"),
      conversions: sum(in7, "conversions"),
      revenueCents: sum(in7, "revenueCents"),
    };
    const prev7 = {
      spendCents: sum(inPrev7, "spendCents"),
      conversions: sum(inPrev7, "conversions"),
      revenueCents: sum(inPrev7, "revenueCents"),
    };
    const prev7Roas = prev7.spendCents > 0 ? prev7.revenueCents / prev7.spendCents : null;

    // Best 7d window in last 14d: brute-force compute every 7-day rolling window.
    // 8 windows total (i=0..7), all ending NO LATER THAN YESTERDAY to keep
    // partial-day today out of the comparison (consistent with trailing-7).
    // i=0 is the oldest window (-14..-8), i=7 is the trailing-7 window (-7..-1).
    let last14dBestWeek = { conversions: 0, roas: 0 };
    for (let i = 0; i <= 7; i++) {
      const startStr = formatInTimeZone(subDays(now, 14 - i), AEST, "yyyy-MM-dd");
      const endStr = formatInTimeZone(subDays(now, 8 - i), AEST, "yyyy-MM-dd");
      const slice = groupRows.filter((r) => r.date >= startStr && r.date <= endStr);
      const c = sum(slice, "conversions");
      const s = sum(slice, "spendCents");
      const rev = sum(slice, "revenueCents");
      const roas = s > 0 ? rev / s : 0;
      if (c > last14dBestWeek.conversions) last14dBestWeek = { conversions: c, roas };
    }

    // De-duplicate inWindow rows by date. At adset and campaign levels each
    // raw row is one ad's daily insight, so a single calendar day can appear
    // multiple times (once per ad in the group). Without this aggregation the
    // pivot table renders duplicate date columns and the days-at-zero count
    // counts ad-rows instead of calendar days.
    type DayBucket = {
      date: string;
      spendCents: number;
      conversions: number;
      revenueCents: number;
      linkClicks: number;
      impressions: number;
    };
    const dailyByDate = new Map<string, DayBucket>();
    for (const r of inWindow) {
      const existing = dailyByDate.get(r.date) ?? {
        date: r.date,
        spendCents: 0,
        conversions: 0,
        revenueCents: 0,
        linkClicks: 0,
        impressions: 0,
      };
      existing.spendCents += r.spendCents;
      existing.conversions += r.conversions ?? 0;
      existing.revenueCents += r.revenueCents ?? 0;
      existing.linkClicks += r.linkClicks ?? 0;
      existing.impressions += r.impressions ?? 0;
      dailyByDate.set(r.date, existing);
    }
    const dailyAggregated = Array.from(dailyByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // daysAtZeroInWindow — count CALENDAR DAYS where total conversions = 0,
    // not raw ad-rows. Uses the de-duplicated daily array above.
    const daysAtZeroInWindow = dailyAggregated.filter((d) => d.conversions === 0).length;

    // daysInLearningLimited: Live Meta data only returns the CURRENT adset learning state,
    // not a per-day historical record. We therefore use a best-effort proxy: if the adset
    // is currently Learning Limited (FAIL), we report 1 day; otherwise 0.
    const latestLearningStatus = first.learningStatus;
    const daysInLearningLimited = latestLearningStatus === "FAIL" ? 1 : 0;

    const sortedDesc = [...groupRows].sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = sortedDesc[0];
    const learningStatusRaw = (latestLearningStatus ?? null) as MetaAdInsightsRow["learningStatusRaw"];
    const lastSignificantEdit = latest?.lastSignificantEdit ?? null;

    // Self-computed "X / 50 since edit" — replicates Meta Ads Manager's
    // Learning Phase Progress popover. The "anchor" is the date Meta would
    // count from:
    //   - last_significant_edit if available (preferred — matches the UI's
    //     "Since last significant edit" label exactly)
    //   - created_time as fallback (matches Meta UI behaviour when no
    //     significant edit has happened — most adsets in the user's account
    //     have no edit history so this is the common case)
    //
    // Rules mirror Meta's published learning-phase definition:
    //   conv-since-anchor >= 50               -> Active     (out of learning)
    //   conv-since-anchor <  50 AND <= 7 days -> Learning   (still calibrating)
    //   conv-since-anchor <  50 AND >  7 days -> Learning Limited
    const learningAnchor: Date | null = lastSignificantEdit ?? latest?.createdTime ?? null;
    const daysSinceLastSignificantEdit = learningAnchor
      ? differenceInCalendarDays(now, new Date(learningAnchor))
      : null;
    let conversionsSinceLastSignificantEdit: number | null = null;
    if (learningAnchor) {
      const anchorDateStr = formatInTimeZone(learningAnchor, AEST, "yyyy-MM-dd");
      conversionsSinceLastSignificantEdit = groupRows
        .filter((r) => r.date >= anchorDateStr)
        .reduce((s, r) => s + (r.conversions ?? 0), 0);
    }

    // lastBudgetChangePct: find the largest day-over-day budget change within the reporting window
    let lastBudgetChangePct: number | null = null;
    let lastBudgetChangeDate: Date | null = null;
    const sortedAsc = [...inWindow].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1]?.adsetBudgetCents;
      const curr = sortedAsc[i]?.adsetBudgetCents;
      if (prev != null && curr != null && prev > 0 && curr !== prev) {
        const pct = ((curr - prev) / prev) * 100;
        if (lastBudgetChangePct === null || Math.abs(pct) > Math.abs(lastBudgetChangePct)) {
          lastBudgetChangePct = Math.round(pct);
          lastBudgetChangeDate = new Date(sortedAsc[i]!.date);
        }
      }
    }

    const isPurchaseCapable = first.campaignObjective
      ? PURCHASE_CAPABLE_OBJECTIVES.has(first.campaignObjective)
      : true; // unknown defaults to capable

    // effectiveStatus represents whether the adset is currently delivering.
    // At campaign level the rolled-up row covers many adsets — picking
    // first.effectiveStatus would be misleading (different adsets can be in
    // different states). Force "UNKNOWN" so the UI hides the pill. Same
    // reasoning for learningStatusBucket — picking first.learningStatus from
    // an arbitrary ad in the campaign would surface a meaningless value.
    const effectiveStatus: EffectiveStatusBucket =
      input.level === "campaign" ? "UNKNOWN" : first.effectiveStatus;

    // Learning bucket computation, in priority order:
    //   1. Meta's own learning_stage_info if Meta is currently populating it
    //      (the ~4% case where Meta knows the state authoritatively).
    //   2. Self-computed from conv-since-edit + days-since-edit (replicates
    //      the Meta Ads Manager UI's "1 / 50 since last edit" model).
    //   3. Fall back to "Unknown" if we have no edit timestamp to anchor
    //      the calculation.
    const metaSaysBucket = bucketFromRaw(learningStatusRaw);
    const computedBucket: LearningStatusBucket =
      conversionsSinceLastSignificantEdit === null || daysSinceLastSignificantEdit === null
        ? "Unknown"
        : conversionsSinceLastSignificantEdit >= 50
          ? "Active"
          : daysSinceLastSignificantEdit > 7
            ? "LearningLimited"
            : "Learning";
    const learningStatusForRow: LearningStatusBucket =
      input.level === "campaign"
        ? "Unknown"
        : metaSaysBucket !== "Unknown"
          ? metaSaysBucket
          : computedBucket;

    result.push({
      level: input.level,
      adAccountId: input.adAccountId,
      id,
      name:
        input.level === "campaign"
          ? first.campaignName ?? id
          : input.level === "adset"
            ? first.adsetName ?? id
            : first.adName ?? id,
      campaignId: first.campaignId ?? "",
      campaignName: first.campaignName ?? "",
      adsetId: first.adsetId,
      adsetName: first.adsetName,
      window: windowTotals,
      // Use dailyAggregated (de-duplicated by date) so the pivot table renders
      // one column per calendar day, not one column per ad-row.
      daily: dailyAggregated,
      last7d: {
        conversions: last7.conversions,
        spendCents: last7.spendCents,
        revenueCents: last7.revenueCents,
        prev7dConversions: prev7.conversions,
        prev7dRoas: prev7Roas,
      },
      last14dBestWeek,
      learningStatusRaw,
      learningStatusBucket: learningStatusForRow,
      effectiveStatus,
      lastSignificantEdit,
      daysSinceLastSignificantEdit,
      createdTime: latest?.createdTime ?? null,
      conversionsSinceLastSignificantEdit,
      daysInLearningLimited,
      lastBudgetChangePct,
      lastBudgetChangeDate,
      campaignObjective: first.campaignObjective ?? null,
      isPurchaseCapableObjective: isPurchaseCapable,
      daysAtZeroInWindow,
    });
  }

  return result;
}
