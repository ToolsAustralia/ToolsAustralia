"use client";

import { ReactNode } from "react";
import { useVariantAssignment } from "@/hooks/ab-testing/useVariantAssignment";
import { VariantProvider } from "./VariantProvider";
import { VariantConfig } from "@/models/ab-testing/Variant";

interface VariantAssignmentWrapperProps {
  experimentId: string | null;
  initialVariantId?: string | null;
  initialVariantConfig?: VariantConfig | null;
  initialAnonymousId?: string | null;
  children: ReactNode;
}

/**
 * Variant Assignment Wrapper
 * Fetches variant assignment and provides it to children
 * Accepts initial server-side assignment to avoid client-side fetch on first render
 */
export function VariantAssignmentWrapper({ 
  experimentId, 
  initialVariantId,
  initialVariantConfig,
  initialAnonymousId,
  children 
}: VariantAssignmentWrapperProps) {
  const { variantId, variantConfig, anonymousId, isLoading } = useVariantAssignment(experimentId);

  // Use initial values if available and hook hasn't loaded yet, otherwise use hook values
  const finalVariantId = isLoading && initialVariantId !== undefined ? initialVariantId : variantId;
  const finalVariantConfig = isLoading && initialVariantConfig !== undefined ? initialVariantConfig : variantConfig;
  const _finalAnonymousId = isLoading && initialAnonymousId !== undefined ? initialAnonymousId : anonymousId;

  return (
    <VariantProvider
      experimentId={experimentId}
      variantId={finalVariantId}
      variantConfig={finalVariantConfig}
      isLoading={isLoading && initialVariantConfig === undefined}
    >
      {children}
    </VariantProvider>
  );
}

