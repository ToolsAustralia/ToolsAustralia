"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Centralised invalidation for every React Query cache slice affected by a purchase
 * or benefit-granting flow. Call from mutation onSuccess with the real session user id.
 */
export function usePurchaseInvalidation() {
  const qc = useQueryClient();

  return useCallback(
    (userId: string) => {
      const keys: readonly unknown[] = [
        queryKeys.users.account(userId),
        queryKeys.users.detail(userId),
        queryKeys.users.dashboard(userId),
        queryKeys.majorDraw.current,
        queryKeys.majorDraw.userStats(userId),
        queryKeys.majorDraw.entries(userId),
        queryKeys.memberships.packages,
        queryKeys.orders.recent(userId),
        queryKeys.orders.all(userId),
        queryKeys.partnerDiscounts.queue,
        queryKeys.rewards.user(userId),
      ];

      keys.forEach((queryKey) => {
        void qc.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
      });
    },
    [qc]
  );
}
