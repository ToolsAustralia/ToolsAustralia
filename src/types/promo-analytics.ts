import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

export interface UTMCampaignMetrics {
  utmSource: string;
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

export interface ChannelDetailResult {
  utmSource: string;
  summary: {
    visits: number;
    signups: number;
    conversions: number;
    revenue: number;
  };
  byPage: ChannelPageMetrics[];
  byCampaign: ChannelCampaignMetrics[];
}
