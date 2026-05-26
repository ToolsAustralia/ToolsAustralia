import type {
  MetaAdInsightsRow,
  Verdict,
  VerdictReason,
  VerdictResult,
  FacebookAdsHealthSettingsValues,
} from "./types";

const HOURS_IN_DAY = 24;

function roasOf(row: MetaAdInsightsRow): number {
  return row.last7d.spendCents > 0 ? row.last7d.revenueCents / row.last7d.spendCents : 0;
}

function effectiveCpaAud(row: MetaAdInsightsRow): number {
  if (row.last7d.conversions <= 0) return Infinity;
  return row.last7d.spendCents / 100 / row.last7d.conversions;
}

function buildScaleReasons(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): { allPass: boolean; reasons: VerdictReason[] } {
  const reasons: VerdictReason[] = [];
  const roas = roasOf(row);
  const wowRoasChangePct =
    row.last7d.prev7dRoas && row.last7d.prev7dRoas > 0
      ? ((roas - row.last7d.prev7dRoas) / row.last7d.prev7dRoas) * 100
      : 0;

  const hoursSinceEdit =
    row.daysSinceLastSignificantEdit !== null
      ? row.daysSinceLastSignificantEdit * HOURS_IN_DAY
      : Infinity;

  reasons.push({
    section: "Out of learning",
    rule: "Meta status",
    source: "meta",
    passed: row.learningStatusBucket === "Active",
    value: `${row.learningStatusBucket}${row.learningStatusRaw ? ` (${row.learningStatusRaw})` : ""}`,
  });
  reasons.push({
    section: "Out of learning",
    rule: "Conversions in last 7d",
    source: "meta",
    passed: row.last7d.conversions >= 50,
    value: `${row.last7d.conversions} (≥50 required)`,
  });
  reasons.push({
    section: "Profitable",
    rule: "ROAS in last 7d",
    source: "tunable",
    passed: roas >= settings.breakevenRoas,
    value: `${roas.toFixed(2)} (≥ ${settings.breakevenRoas.toFixed(2)} breakeven)`,
  });
  reasons.push({
    section: "Stable",
    rule: "No significant edit in last postEditWaitHours",
    source: "meta",
    passed: hoursSinceEdit >= settings.postEditWaitHours,
    value:
      row.daysSinceLastSignificantEdit !== null
        ? `last edit ${row.daysSinceLastSignificantEdit}d ago`
        : "never edited",
  });
  reasons.push({
    section: "Stable",
    rule: "ROAS week-over-week change ≥ -roasDropTriggerPct",
    source: "tunable",
    passed: wowRoasChangePct >= -settings.roasDropTriggerPct,
    value: `${wowRoasChangePct >= 0 ? "+" : ""}${wowRoasChangePct.toFixed(1)}%`,
  });

  return { allPass: reasons.every((r) => r.passed === true), reasons };
}

function buildCutReasons(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): { anyPass: boolean; reasons: VerdictReason[] } {
  const reasons: VerdictReason[] = [];
  const cpa = effectiveCpaAud(row);
  const spendAud7d = row.last7d.spendCents / 100;
  const limitedLongEnough =
    row.learningStatusBucket === "LearningLimited" && row.daysInLearningLimited >= 3;
  const limitedSpendFloor = row.window.spendCents / 100 >= 5 * settings.targetCpaAud;

  reasons.push({
    section: "Cut triggers",
    rule: "Learning Limited ≥ 3d AND window spend ≥ 5x targetCpa",
    source: "meta",
    passed: limitedLongEnough && limitedSpendFloor,
    value: `LL=${row.daysInLearningLimited}d, spend=$${(row.window.spendCents / 100).toFixed(0)} vs floor $${(5 * settings.targetCpaAud).toFixed(0)}`,
  });

  const spendVsMultiplier = spendAud7d >= settings.zeroConvSpendMultiplier * settings.targetCpaAud;
  const badCpa = row.last7d.conversions === 0 || cpa > 2 * settings.targetCpaAud;
  reasons.push({
    section: "Cut triggers",
    rule: "Spend ≥ zeroConvSpendMultiplier × targetCpa AND (0 conv OR CPA > 2x target)",
    source: "tunable",
    passed: spendVsMultiplier && badCpa,
    value:
      row.last7d.conversions === 0
        ? `spend $${spendAud7d.toFixed(0)} / 0 conv`
        : `spend $${spendAud7d.toFixed(0)} / ${row.last7d.conversions} conv = $${cpa.toFixed(0)} CPA vs target $${settings.targetCpaAud}`,
  });

  reasons.push({
    section: "Cut triggers",
    rule: "Campaign objective is purchase-capable",
    source: "meta",
    passed: !row.isPurchaseCapableObjective,
    value: row.campaignObjective ?? "(unknown)",
  });

  return { anyPass: reasons.some((r) => r.passed === true), reasons };
}

export function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): VerdictResult {
  const cut = buildCutReasons(row, settings);
  if (cut.anyPass) {
    return {
      verdict: "cut",
      reasons: cut.reasons,
      actionText: `Pause this adset in Meta. Reallocate $${(row.window.spendCents / 100).toFixed(0)}/window to working adsets.`,
    };
  }

  const scale = buildScaleReasons(row, settings);
  if (scale.allPass) {
    return {
      verdict: "scale",
      reasons: scale.reasons,
      actionText: `Raise daily budget by 20%. Re-evaluate in ${settings.postEditWaitHours} hours.`,
    };
  }

  return {
    verdict: "hold",
    reasons: scale.reasons,
    actionText: "Do nothing. Re-check in 48 hours.",
  };
}
