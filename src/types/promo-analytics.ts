import type { PromoPageType } from "@/models/PromoAnalyticsVisit";
import type { ConvertingPlatform } from "@/types/attribution";

export interface UTMCampaignMetrics {
  /** Canonical acquisition channel this campaign belongs to. */
  channel: ConvertingPlatform;
  /** Human label from src/config/attribution-channels.ts. */
  channelLabel: string;
  utmMedium: string;
  utmCampaign: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

/**
 * One prize combination, scoped to ONE landing page.
 *
 * Field-for-field twin of the cross-page `BuiltPrizeMetrics` in the repository, so the two
 * tables read identically and a reader never has to ask whether "builders" means the same
 * thing in both.
 */
export interface PrizeBuildMetrics {
  builtPrizeSlug: string;
  /** Unique visitors whose final on-screen combination on this page was this one. */
  builders: number;
  /** Of `builders`, those who actually changed the build rather than accepting what loaded. */
  interactedBuilders: number;
  signups: number;
  conversions: number;
  revenue: number;
  builderToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
  /** True for the combination this page opens on when nobody touches the builder. */
  isPageDefault: boolean;
}

/**
 * Per-page prize-build breakdown.
 *
 * ⚠️ `buildVisitors` and `builds` are page-level uniques and are NOT the column sums of
 * `byBuild`. A visitor who lands twice and settles on a different combination each time counts
 * once here and twice there, so `Σ byBuild[].builders ≥ buildVisitors` always. Never render
 * these as a table footer total — mixing those two units is what once shipped a literal 250%
 * column on this dashboard.
 */
export interface PageBuildBreakdown {
  /** The combination this page shows on first paint, before any interaction. */
  defaultBuiltPrizeSlug: string;
  /** Unique visitors on this page who ended on some combination (exposure). */
  buildVisitors: number;
  /** Of those, the ones who changed it (engagement). */
  builds: number;
  /** `builds / buildVisitors` as a percentage; 0 when nobody saw a combination. */
  buildChangeRate: number;
  byBuild: PrizeBuildMetrics[];
}

export interface PageDetailResult {
  pageType: PromoPageType;
  slug: string;
  pageLabel: string;
  summary: {
    visits: number;
    signups: number;
    conversions: number;
    revenue: number;
  };
  byCampaign: UTMCampaignMetrics[];
  buildBreakdown: PageBuildBreakdown;
}

export interface ChannelPageMetrics {
  pageType: PromoPageType;
  slug: string;
  pageLabel: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface ChannelCampaignMetrics {
  utmCampaign: string;
  utmMedium: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

/** A raw `utm_source` value that folded into a channel, for auditability. */
export interface ChannelRawSource {
  source: string;
  visits: number;
}

export interface ChannelDetailResult {
  channel: ConvertingPlatform;
  channelLabel: string;
  summary: {
    visits: number;
    signups: number;
    conversions: number;
    revenue: number;
  };
  byPage: ChannelPageMetrics[];
  byCampaign: ChannelCampaignMetrics[];
  /**
   * The raw `utm_source` values that folded into this channel, most-visited first.
   *
   * ⚠️ PER-SOURCE uniques. One visitor can arrive via `ig` and later `facebook.com`, so these
   * MAY sum above `summary.visits`. Present for auditability ("what actually merged into
   * Facebook / Instagram?"), never as an addend.
   */
  rawSources: ChannelRawSource[];
}
