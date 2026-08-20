import type { SpendByUrlDetailRow } from "@/hooks/queries/useSpendByUrlAnalytics";
import type {
  PackagesFocusCampaignNode,
  PackagesFocusAdNode,
  PackagesFocusTotals,
} from "@/hooks/queries/usePackagesFocusBreakdown";

export type SpendByUrlAdSortColumn =
  | "ad"
  | "spend"
  | "clicks"
  | "impressions"
  | "cpc"
  | "revenue"
  | "conversions"
  | "roas";

export type SpendByUrlAdSortDir = "asc" | "desc";

export function filterSpendByUrlDetailRows(
  rows: SpendByUrlDetailRow[],
  query: string
): SpendByUrlDetailRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const id = r.adId.toLowerCase();
    const name = (r.adName ?? "").toLowerCase();
    return id.includes(q) || name.includes(q);
  });
}

function adSortKey(r: SpendByUrlDetailRow): string {
  return `${r.adId} ${r.adName ?? ""}`.toLowerCase();
}

export function sortSpendByUrlDetailRows(
  rows: SpendByUrlDetailRow[],
  key: SpendByUrlAdSortColumn,
  dir: SpendByUrlAdSortDir
): SpendByUrlDetailRow[] {
  const out = [...rows];
  const sign = dir === "desc" ? -1 : 1;
  out.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "ad":
        cmp = adSortKey(a).localeCompare(adSortKey(b));
        break;
      case "spend":
        cmp = a.spend - b.spend;
        break;
      case "clicks":
        cmp = a.clicks - b.clicks;
        break;
      case "impressions":
        cmp = a.impressions - b.impressions;
        break;
      case "cpc":
        cmp = a.cpc - b.cpc;
        break;
      case "revenue":
        cmp = a.revenue - b.revenue;
        break;
      case "conversions":
        cmp = a.conversions - b.conversions;
        break;
      case "roas":
        cmp = a.roas - b.roas;
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return sign * cmp;
    return a.adId.localeCompare(b.adId);
  });
  return out;
}

export interface SpendByUrlAdFormatGroup {
  format: SpendByUrlDetailRow["adFormat"];
  label: string;
  rows: SpendByUrlDetailRow[];
}

const FORMAT_ORDER: SpendByUrlDetailRow["adFormat"][] = ["video", "static", "carousel", "unknown"];

const FORMAT_LABELS: Record<SpendByUrlDetailRow["adFormat"], string> = {
  video: "VIDEO ADS",
  static: "STATIC ADS",
  carousel: "CAROUSEL",
  unknown: "OTHER / UNRESOLVED CREATIVE",
};

export function groupAdsByFormatForDisplay(rows: SpendByUrlDetailRow[]): SpendByUrlAdFormatGroup[] {
  return FORMAT_ORDER.map((format) => ({
    format,
    label: FORMAT_LABELS[format],
    rows: rows.filter((r) => (r.adFormat ?? "unknown") === format),
  })).filter((g) => g.rows.length > 0);
}

/** Rolled-up metrics for a set of ad rows (same basis as API: CPC / ROAS from summed spend & clicks). */
export interface SpendByUrlDetailRollup {
  adCount: number;
  spend: number;
  clicks: number;
  impressions: number;
  revenue: number;
  conversions: number;
  cpc: number;
  roas: number;
}

export function rollupSpendByUrlDetailRows(rows: SpendByUrlDetailRow[]): SpendByUrlDetailRollup {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const conversions = rows.reduce((s, r) => s + r.conversions, 0);
  const cpc = clicks > 0 ? spend / clicks : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  return {
    adCount: rows.length,
    spend,
    clicks,
    impressions,
    revenue,
    conversions,
    cpc,
    roas,
  };
}

/** Stable fingerprint for resetting UI when the underlying dataset changes. */
export function spendByUrlDetailRowsFingerprint(rows: SpendByUrlDetailRow[]): string {
  if (rows.length === 0) return "";
  return rows
    .map((r) => r.adId)
    .sort()
    .join(",");
}

/**
 * Group per-ad detail rows into the campaign → adset → ad tree shape shared with
 * the packages-focus breakdown endpoint, so BrandPerformanceAdsModal and
 * AdSpendFocusModal render through one CampaignTreeTable. Detail rows are
 * pre-aggregated per ad, so node totals are simple sums; each ad node carries
 * its packagesFocus for badge display + chip filtering.
 */
export function groupSpendByUrlDetailRowsByCampaign(rows: SpendByUrlDetailRow[]): PackagesFocusCampaignNode[] {
  const toTotals = (acc: { spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number }): PackagesFocusTotals => {
    const spend = Math.round(acc.spendCents) / 100;
    const revenue = Math.round(acc.revenueCents) / 100;
    return {
      spend, spendCents: acc.spendCents, revenue, revenueCents: acc.revenueCents,
      roas: spend > 0 ? revenue / spend : 0,
      conversions: acc.conversions, impressions: acc.impressions, clicks: acc.clicks,
    };
  };

  type Acc = { spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number };
  const newAcc = (): Acc => ({ spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0 });
  const add = (acc: Acc, r: SpendByUrlDetailRow) => {
    acc.spendCents += r.spendCents; acc.revenueCents += r.revenueCents;
    acc.conversions += r.conversions; acc.impressions += r.impressions; acc.clicks += r.clicks;
  };

  const campaigns = new Map<string, { name?: string; acc: Acc; adsets: Map<string, { name?: string; acc: Acc; ads: PackagesFocusAdNode[] }> }>();
  for (const r of rows) {
    const cid = r.campaignId ?? "unknown-campaign";
    const sid = r.adsetId ?? "unknown-adset";
    const c = campaigns.get(cid) ?? { name: undefined, acc: newAcc(), adsets: new Map() };
    c.name = r.campaignName ?? c.name;
    add(c.acc, r);
    const s = c.adsets.get(sid) ?? { name: undefined, acc: newAcc(), ads: [] };
    s.name = r.adsetName ?? s.name;
    add(s.acc, r);
    const adAcc = newAcc();
    add(adAcc, r);
    s.ads.push({ adId: r.adId, adName: r.adName, adFormat: r.adFormat, totals: toTotals(adAcc), packagesFocus: r.packagesFocus });
    c.adsets.set(sid, s);
    campaigns.set(cid, c);
  }

  return [...campaigns.entries()]
    .map(([campaignId, c]) => ({
      campaignId,
      campaignName: c.name,
      totals: toTotals(c.acc),
      adsets: [...c.adsets.entries()]
        .map(([adsetId, s]) => ({
          adsetId,
          adsetName: s.name,
          totals: toTotals(s.acc),
          ads: s.ads.sort((a, b) => b.totals.spendCents - a.totals.spendCents),
        }))
        .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
    }))
    .sort((a, b) => b.totals.spendCents - a.totals.spendCents);
}
