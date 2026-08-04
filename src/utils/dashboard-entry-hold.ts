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

/**
 * Last-resort ceiling on a hold's lifetime — a BACKSTOP, not the release mechanism.
 *
 * The real release is `LoadingContext.hideSuccess()`, which fires when the global success
 * overlay closes on ANY page (that provider is globally mounted), plus the explicit clears on
 * the payment error/timeout paths. This timer exists only so that a future code path which
 * arms a hold and then never shows or closes an overlay still cannot freeze the wallet
 * indefinitely.
 *
 * It is deliberately NOT tuned to the webhook window: relying on a timeout to release the hold
 * would leave the wallet stale for however long the timeout is, which is the original bug in
 * slower form. If this timer is ever what releases a hold in practice, that is a bug in the
 * flow that armed it.
 */
const HOLD_MAX_MS = 30_000;

let snapshot: DashboardEntryHoldSnapshot | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
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
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(clearDashboardEntryHold, HOLD_MAX_MS);
  emit();
}

/** Arm from cached `queryKeys.majorDraw.userStats` value; a cold/empty cache arms nothing. */
export function armDashboardEntryHoldFromUserStatsCache(raw: unknown) {
  // Nothing cached to capture (cold cache, or the user has no stats yet — the query
  // legitimately resolves to null). Arming a fabricated {0,0,0} would freeze the wallet at
  // "no entries" straight after a successful purchase, so arm no hold at all instead.
  if (!raw || typeof raw !== "object") return;
  const o = raw as Record<string, unknown>;
  armDashboardEntryHold({
    currentDrawEntries: Number(o.currentDrawEntries) || 0,
    membershipEntries: Number(o.membershipEntries) || 0,
    oneTimeEntries: Number(o.oneTimeEntries) || 0,
  });
}

export function clearDashboardEntryHold() {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  snapshot = null;
  emit();
}
