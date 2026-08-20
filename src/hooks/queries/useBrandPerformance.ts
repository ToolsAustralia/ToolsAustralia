import { useQuery } from "@tanstack/react-query";
import type {
  BrandPerformanceBasis,
  BrandPerformancePlatformScope,
  BrandPerformanceResult,
} from "@/services/analytics/BrandPerformanceService";
import type { BrandLane } from "@/utils/metrics/brand-lane";

/**
 * Brand Performance rows for the admin Overview.
 *
 * TYPES ONLY from `@/services/analytics/BrandPerformanceService` — the service imports Mongoose
 * models, so a VALUE import would ship the data layer to the browser. `import type` is erased at
 * compile time, which is what makes this safe; the `no-models-in-client` lint rule only catches
 * direct `@/models/**` imports, so this boundary is maintained by hand (same rule as
 * `useReceipts`, see docs/client-state/patterns.md P9).
 *
 * Inline query key per the dominant admin convention. `basis`, `lane`, `platform` and `compare`
 * are all part of the key: each produces genuinely different numbers, so sharing a cache entry
 * across them would show one toggle's data under another toggle's heading.
 */
export interface BrandPerformanceResponse extends BrandPerformanceResult {
  success: boolean;
}

export function useBrandPerformance(
  startDate: string | undefined,
  endDate: string | undefined,
  options: {
    lane: BrandLane;
    basis: BrandPerformanceBasis;
    platform: BrandPerformancePlatformScope;
    /** Attach the previous calendar month to every row as `comparison`. */
    compare?: boolean;
    enabled?: boolean;
  },
) {
  const { lane, basis, platform, compare = false } = options;

  return useQuery<BrandPerformanceResponse>({
    queryKey: [
      "admin",
      "analytics",
      "brand-performance",
      lane,
      basis,
      platform,
      compare,
      startDate,
      endDate,
    ],
    enabled: options.enabled !== false && Boolean(startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("lane", lane);
      params.set("basis", basis);
      params.set("platform", platform);
      if (compare) params.set("compare", "previous-period");

      const res = await fetch(`/api/admin/analytics/brand-performance?${params.toString()}`);
      const json = (await res.json()) as BrandPerformanceResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load brand performance");
      }
      return json;
    },
  });
}
