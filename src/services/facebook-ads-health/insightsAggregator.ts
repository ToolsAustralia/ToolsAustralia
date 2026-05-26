import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { subDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PURCHASE_CAPABLE_OBJECTIVES, type MetaAdInsightsRow, type LearningStatusBucket } from "./types";

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
}

export async function aggregateInsights(input: AggregatorInput): Promise<MetaAdInsightsRow[]> {
  const fbSince = formatInTimeZone(input.startDate, AEST, "yyyy-MM-dd");
  const fbUntil = formatInTimeZone(input.endDate, AEST, "yyyy-MM-dd");

  // Trailing 7d, trailing 14d, prev 7d (for WoW comparison)
  const trailing7Start = formatInTimeZone(subDays(new Date(), 6), AEST, "yyyy-MM-dd");
  const prev7Start = formatInTimeZone(subDays(new Date(), 13), AEST, "yyyy-MM-dd");
  const prev7End = formatInTimeZone(subDays(new Date(), 7), AEST, "yyyy-MM-dd");
  const trailing14Start = formatInTimeZone(subDays(new Date(), 13), AEST, "yyyy-MM-dd");
  const todayStr = formatInTimeZone(new Date(), AEST, "yyyy-MM-dd");

  // Pull a broad slice: from min(reportingStart, trailing14Start) to today
  const earliest = fbSince < trailing14Start ? fbSince : trailing14Start;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (MetaAdInsightsDaily.find({
    adAccountId: input.adAccountId,
    date: { $gte: earliest, $lte: todayStr },
  }).lean() as any) as Array<{
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
    lastSignificantEdit: Date | null;
  }>;

  // Group by level
  const groupKey = (r: typeof rows[number]): string => {
    if (input.level === "campaign") return r.campaignId ?? "(none)";
    if (input.level === "adset") return r.adsetId ?? "(none)";
    return r.adId;
  };

  const groups = new Map<string, typeof rows>();
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
    const in7 = groupRows.filter((r) => r.date >= trailing7Start && r.date <= todayStr);
    const inPrev7 = groupRows.filter((r) => r.date >= prev7Start && r.date < prev7End);

    const sum = (arr: typeof groupRows, key: "spendCents" | "conversions" | "revenueCents" | "linkClicks" | "impressions") =>
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
    // 8 windows total (i=0..7). Each window is [startStr, endStr] inclusive on
    // both ends — a true 7-day span. i=0 is the oldest window (13d ago → 7d ago),
    // i=7 is the trailing-7 window (6d ago → today).
    let last14dBestWeek = { conversions: 0, roas: 0 };
    for (let i = 0; i <= 7; i++) {
      const startStr = formatInTimeZone(subDays(new Date(), 13 - i), AEST, "yyyy-MM-dd");
      const endStr = formatInTimeZone(subDays(new Date(), 7 - i), AEST, "yyyy-MM-dd");
      const slice = groupRows.filter((r) => r.date >= startStr && r.date <= endStr);
      const c = sum(slice, "conversions");
      const s = sum(slice, "spendCents");
      const rev = sum(slice, "revenueCents");
      const roas = s > 0 ? rev / s : 0;
      if (c > last14dBestWeek.conversions) last14dBestWeek = { conversions: c, roas };
    }

    // daysAtZeroInWindow
    const daysAtZeroInWindow = inWindow.filter((r) => (r.conversions ?? 0) === 0).length;

    // daysInLearningLimited: count from most recent backwards while learningStatus stays FAIL
    let daysInLearningLimited = 0;
    const sortedDesc = [...groupRows].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const r of sortedDesc) {
      if (r.learningStatus === "FAIL") daysInLearningLimited++;
      else break;
    }

    const latest = sortedDesc[0];
    const learningStatusRaw = (latest?.learningStatus ?? null) as MetaAdInsightsRow["learningStatusRaw"];
    const lastSignificantEdit = latest?.lastSignificantEdit ?? null;
    const daysSinceLastSignificantEdit = lastSignificantEdit
      ? differenceInCalendarDays(new Date(), new Date(lastSignificantEdit))
      : null;

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
      daily: inWindow.map((r) => ({
        date: r.date,
        spendCents: r.spendCents,
        conversions: r.conversions ?? 0,
        revenueCents: r.revenueCents ?? 0,
        linkClicks: r.linkClicks ?? 0,
        impressions: r.impressions ?? 0,
      })),
      last7d: {
        conversions: last7.conversions,
        spendCents: last7.spendCents,
        revenueCents: last7.revenueCents,
        prev7dConversions: prev7.conversions,
        prev7dRoas: prev7Roas,
      },
      last14dBestWeek,
      learningStatusRaw,
      learningStatusBucket: bucketFromRaw(learningStatusRaw),
      lastSignificantEdit,
      daysSinceLastSignificantEdit,
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
