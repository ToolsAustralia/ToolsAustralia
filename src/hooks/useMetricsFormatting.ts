/**
 * Hook for metrics formatting utilities
 */

import { useMemo } from "react";
import {
  formatCurrency,
  formatPercentage,
  formatNumber,
  formatROAS,
  formatPercentageChange,
  fmtCompact,
} from "@/utils/metrics/formatters";

export function useMetricsFormatting() {
  return useMemo(
    () => ({
      formatCurrency,
      formatPercentage,
      formatNumber,
      formatROAS,
      formatPercentageChange,
      fmtCompact,
    }),
    []
  );
}

