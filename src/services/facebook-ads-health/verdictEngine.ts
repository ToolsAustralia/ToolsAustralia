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

// Used by CUT/INVESTIGATE rules in follow-up tasks (7, 8)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): VerdictResult {
  const scale = buildScaleReasons(row, settings);
  if (scale.allPass) {
    return {
      verdict: "scale",
      reasons: scale.reasons,
      actionText: `Raise daily budget by 20%. Re-evaluate in ${settings.postEditWaitHours} hours.`,
    };
  }

  // TODO Phase 2 follow-up tasks: Hold, Investigate, Cut
  return {
    verdict: "hold",
    reasons: scale.reasons,
    actionText: "Do nothing. Re-check in 48 hours.",
  };
}
