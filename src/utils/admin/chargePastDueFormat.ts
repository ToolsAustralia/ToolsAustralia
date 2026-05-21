export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Match the Stripe "this invoice can no longer be paid" error pattern in
 * already-logged failed rows. Used by the manual-retries table and the
 * run-detail drawer to decide which historical rows the admin can recover.
 *
 * For NEW charge attempts, the source of truth is `chooseChargeAction(invoice)`
 * in `src/server/admin/chargeOrRecoverPolicy.ts` — which reads Stripe state
 * directly. This helper is a string-match fallback for log rows that predate
 * the auto-recovery wrapper, and is sensitive to Stripe wording changes.
 */
export function isStrandedError(
  errorMessage?: string | null,
  errorCode?: string | null
): boolean {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("no longer be paid") || msg.includes("no longer payable")) return true;
  return errorCode === "invoice_not_payable";
}
