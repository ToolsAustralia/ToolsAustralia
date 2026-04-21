"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLoading } from "@/contexts/LoadingContext";
import {
  subscribeDashboardEntryHold,
  getDashboardEntryHoldSnapshot,
  clearDashboardEntryHold,
} from "@/utils/dashboard-entry-hold";

export type DashboardEntryDisplay = {
  currentDrawEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
};

/**
 * Live major-draw entry buckets for the dashboard, optionally frozen at pre-purchase values
 * until the global success overlay closes (then one animated transition to server state).
 */
export function useDashboardEntryDisplay(
  stats:
    | { currentDrawEntries?: number; membershipEntries?: number; oneTimeEntries?: number }
    | null
    | undefined,
  options: { isDrawCompleted: boolean }
): DashboardEntryDisplay {
  const { isSuccessScreenVisible } = useLoading();
  const hold = useSyncExternalStore(
    subscribeDashboardEntryHold,
    getDashboardEntryHoldSnapshot,
    getDashboardEntryHoldSnapshot
  );

  const prevSuccessVisible = useRef(isSuccessScreenVisible);
  useEffect(() => {
    if (prevSuccessVisible.current && !isSuccessScreenVisible && getDashboardEntryHoldSnapshot() !== null) {
      clearDashboardEntryHold();
    }
    prevSuccessVisible.current = isSuccessScreenVisible;
  }, [isSuccessScreenVisible]);

  const liveMembership = options.isDrawCompleted ? 0 : (stats?.membershipEntries ?? 0);
  const live: DashboardEntryDisplay = {
    currentDrawEntries: stats?.currentDrawEntries ?? 0,
    membershipEntries: liveMembership,
    oneTimeEntries: stats?.oneTimeEntries ?? 0,
  };

  if (hold) {
    return {
      currentDrawEntries: hold.currentDrawEntries,
      membershipEntries: options.isDrawCompleted ? 0 : hold.membershipEntries,
      oneTimeEntries: hold.oneTimeEntries,
    };
  }

  return live;
}
