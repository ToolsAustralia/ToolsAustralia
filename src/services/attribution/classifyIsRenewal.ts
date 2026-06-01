// src/services/attribution/classifyIsRenewal.ts
// A "renewal" = a recurring billing cycle that is NOT a first charge, upgrade, or resubscribe.
// Excluding subscription_update prevents mid-cycle upgrades being miscounted as new revenue.
export function classifyIsRenewal(input: {
  billingReason?: string;
  isUpgrade?: boolean;
  isResubscribe?: boolean;
}): boolean {
  const { billingReason, isUpgrade, isResubscribe } = input;
  if (!billingReason) return false;
  if (billingReason === "subscription_create") return false;
  if (isUpgrade || isResubscribe) return false;
  return billingReason === "subscription_cycle";
}
