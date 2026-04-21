/**
 * While a purchase is in flight / success overlay is visible, the my-account dashboard
 * can freeze major-draw entry counts at the pre-purchase snapshot so AnimatedNumber
 * only runs after the user dismisses the global success screen.
 */

export type DashboardEntryHoldSnapshot = {
  currentDrawEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
};

let snapshot: DashboardEntryHoldSnapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeDashboardEntryHold(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDashboardEntryHoldSnapshot(): DashboardEntryHoldSnapshot | null {
  return snapshot;
}

/** Call from purchase onMutate with current React Query user major-draw stats. */
export function armDashboardEntryHold(s: DashboardEntryHoldSnapshot) {
  snapshot = { ...s };
  emit();
}

/** Arm from cached `queryKeys.majorDraw.userStats` value; uses zeros when cache not loaded yet. */
export function armDashboardEntryHoldFromUserStatsCache(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    armDashboardEntryHold({
      currentDrawEntries: 0,
      membershipEntries: 0,
      oneTimeEntries: 0,
    });
    return;
  }
  const o = raw as Record<string, unknown>;
  armDashboardEntryHold({
    currentDrawEntries: Number(o.currentDrawEntries) || 0,
    membershipEntries: Number(o.membershipEntries) || 0,
    oneTimeEntries: Number(o.oneTimeEntries) || 0,
  });
}

export function clearDashboardEntryHold() {
  snapshot = null;
  emit();
}
