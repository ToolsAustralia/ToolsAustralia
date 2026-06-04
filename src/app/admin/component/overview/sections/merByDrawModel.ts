/**
 * Pure presentation model for the MER-by-draw card. React-free so it is
 * unit-testable; the component only formats these values.
 *
 * The blended New Revenue numerator (service-side) includes every attributed
 * platform incl. google/other, but the breakdown UI only surfaces the channels
 * the operator acts on (Meta/TikTok/Snapchat + Klaviyo + Direct). Google/Other
 * are folded into the blended total but get no dedicated row — they are ~0 for
 * this business and there is no logo for them.
 */
import type { PlatformLogoName } from "@/components/admin/ui";
import type {
  AttributedPlatformKey,
  MerAdPlatform,
  MerDrawRow,
  MerPlatformBreakdown,
} from "@/types/admin/mer";

export interface MerPlatformDisplay {
  key: AttributedPlatformKey;
  label: string;
  logo: PlatformLogoName;
  kind: "paid" | "owned";
  /** Always render this breakdown row even at $0 (the core ad channels the toggle references). */
  core: boolean;
}

/** Breakdown rows, in display order. */
export const MER_PLATFORM_DISPLAY: MerPlatformDisplay[] = [
  { key: "meta", label: "Facebook Ads", logo: "facebook", kind: "paid", core: true },
  { key: "tiktok", label: "TikTok Ads", logo: "tiktok", kind: "paid", core: true },
  { key: "snapchat", label: "Snapchat Ads", logo: "snapchat", kind: "paid", core: true },
  { key: "klaviyo_email", label: "Klaviyo Email", logo: "klaviyo", kind: "owned", core: false },
  { key: "klaviyo_sms", label: "Klaviyo SMS", logo: "klaviyo", kind: "owned", core: false },
  { key: "direct", label: "Direct", logo: "direct", kind: "owned", core: false },
];

/** Top-level platform toggle — default TikTok (the channel the client wants to judge). */
export const MER_TOGGLE_OPTIONS: { value: MerAdPlatform; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "meta", label: "Meta" },
  { value: "snapchat", label: "Snapchat" },
];
export const MER_DEFAULT_PLATFORM: MerAdPlatform = "tiktok";

/** Label used in the dynamic column headers, e.g. "Ad Spend (TikTok)". */
export function platformShortLabel(platform: MerAdPlatform): string {
  return MER_TOGGLE_OPTIONS.find((o) => o.value === platform)?.label ?? platform;
}

/** MER ratio → display string ("3.42x" or "—"). */
export function formatMer(mer: number | null): string {
  return mer != null && Number.isFinite(mer) ? `${mer.toFixed(2)}x` : "—";
}

/** Find one platform's breakdown within a draw row (for the toggle columns). */
export function platformOf(
  row: MerDrawRow,
  key: AttributedPlatformKey
): MerPlatformBreakdown | undefined {
  return row.platforms.find((p) => p.platform === key);
}

/**
 * Breakdown rows to render for the expanded draw: core ad channels always, the
 * rest only when they have acquisition revenue. Paired with its display config
 * so the component can render logo/label without another lookup.
 */
export function visibleBreakdown(
  row: MerDrawRow
): { display: MerPlatformDisplay; data: MerPlatformBreakdown }[] {
  const out: { display: MerPlatformDisplay; data: MerPlatformBreakdown }[] = [];
  for (const display of MER_PLATFORM_DISPLAY) {
    const data = platformOf(row, display.key);
    if (!data) continue;
    if (!display.core && data.newRevenue <= 0) continue;
    out.push({ display, data });
  }
  return out;
}

/** Sortable columns. `value` returns a comparable; nulls sort to the bottom (treated as -Infinity for desc-first UX). */
export type MerSortKey =
  | "period"
  | "newRevenue"
  | "adSpend"
  | "mer"
  | "platformSpend"
  | "platformMer";

export function rowSortValue(
  row: MerDrawRow,
  key: MerSortKey,
  platform: MerAdPlatform
): number | string {
  switch (key) {
    case "period":
      return row.periodStart;
    case "newRevenue":
      return row.newRevenue;
    case "adSpend":
      return row.adSpend;
    case "mer":
      return row.mer ?? -Infinity;
    case "platformSpend":
      return platformOf(row, platform)?.adSpend ?? -Infinity;
    case "platformMer":
      return platformOf(row, platform)?.mer ?? -Infinity;
    default:
      return 0;
  }
}

/** Stable sort of draw rows by a column. Default usage: key="period", dir=-1 (newest on top). */
export function sortMerRows(
  rows: MerDrawRow[],
  key: MerSortKey,
  dir: 1 | -1,
  platform: MerAdPlatform
): MerDrawRow[] {
  return [...rows].sort((a, b) => {
    const av = rowSortValue(a, key, platform);
    const bv = rowSortValue(b, key, platform);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
