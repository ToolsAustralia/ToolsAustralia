"use client";

import { createContext, useContext, ReactNode } from "react";
import { VariantConfig } from "@/models/ab-testing/Variant";

interface VariantContextType {
  experimentId: string | null;
  variantId: string | null;
  variantConfig: VariantConfig | null;
  isLoading: boolean;
}

const VariantContext = createContext<VariantContextType>({
  experimentId: null,
  variantId: null,
  variantConfig: null,
  isLoading: true,
});

export function useVariantContext() {
  return useContext(VariantContext);
}

interface VariantProviderProps {
  experimentId: string | null;
  variantId: string | null;
  variantConfig: VariantConfig | null;
  isLoading: boolean;
  children: ReactNode;
}

/**
 * Variant Provider
 * Provides variant context to child components
 */
export function VariantProvider({
  experimentId,
  variantId,
  variantConfig,
  isLoading,
  children,
}: VariantProviderProps) {
  return (
    <VariantContext.Provider
      value={{
        experimentId,
        variantId,
        variantConfig,
        isLoading,
      }}
    >
      {children}
    </VariantContext.Provider>
  );
}

