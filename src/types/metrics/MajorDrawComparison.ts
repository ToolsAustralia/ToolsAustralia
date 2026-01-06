/**
 * Major Draw Comparison Type Definitions
 * 
 * Type definitions for major draw vs major draw metrics comparison.
 */

import type { IDailyMetrics } from "./DailyMetrics";

export interface MajorDrawComparisonQuery {
  currentDrawId: string;
  previousDrawId: string;
}

export interface MajorDrawComparisonData {
  currentDraw: IDailyMetrics[];
  previousDraw: IDailyMetrics[];
  currentDrawTotal: DrawTotals;
  previousDrawTotal: DrawTotals;
  comparison: ComparisonMetrics;
  currentDrawInfo: {
    id: string;
    name: string;
    drawDate: Date;
    activationDate: Date;
  };
  previousDrawInfo: {
    id: string;
    name: string;
    drawDate: Date;
    activationDate: Date;
  };
}

export interface DrawTotals {
  adSpend: number;
  revenue: number;
  salesCount: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface ComparisonMetrics {
  adSpend: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  revenue: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  salesCount: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  profit: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  roas: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  conversions: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
}

export interface MajorDrawComparisonResponse {
  data: MajorDrawComparisonData;
}


