"use client";

import { ReactNode } from "react";
import { useVariantAssignment } from "@/hooks/ab-testing/useVariantAssignment";
import { VariantProvider } from "./VariantProvider";

interface VariantAssignmentWrapperProps {
  experimentId: string | null;
  children: ReactNode;
}

/**
 * Variant Assignment Wrapper
 * Fetches variant assignment and provides it to children
 */
export function VariantAssignmentWrapper({ experimentId, children }: VariantAssignmentWrapperProps) {
  const { variantId, variantConfig, isLoading } = useVariantAssignment(experimentId);

  return (
    <VariantProvider
      experimentId={experimentId}
      variantId={variantId}
      variantConfig={variantConfig}
      isLoading={isLoading}
    >
      {children}
    </VariantProvider>
  );
}

