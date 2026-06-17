"use client";

import { useMemo } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";

interface VariantConfigResult {
  heroConfig: VariantConfig["hero"] | null;
  bannerConfig: VariantConfig["banner"] | null;
  packagesConfig: VariantConfig["packages"] | null;
  membershipModalConfig: VariantConfig["membershipModal"] | null;
}

/**
 * Hook to access merged variant config
 * Merges variant config with defaults
 */
export function useVariantConfig(variantConfig: VariantConfig | null): VariantConfigResult {
  return useMemo(() => {
    if (!variantConfig) {
      return {
        heroConfig: null,
        bannerConfig: null,
        packagesConfig: null,
        membershipModalConfig: null,
      };
    }

    return {
      heroConfig: variantConfig.hero || null,
      bannerConfig: variantConfig.banner || null,
      packagesConfig: variantConfig.packages || null,
      membershipModalConfig: variantConfig.membershipModal || null,
    };
  }, [variantConfig]);
}

