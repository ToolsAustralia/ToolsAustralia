/**
 * Service wrapper around the Klaviyo draw-reset utility module.
 *
 * The actual bulk-sync mechanics live in
 * `src/utils/integrations/klaviyo/klaviyo-draw-reset.ts` because that file
 * predates the services layer and is also imported from cron / migrations.
 * This wrapper re-exports the read-side helpers so admin and Norm route
 * handlers can import them from `@/services/**` (satisfying the must-import-
 * service rule for Norm routes and the layering convention generally).
 */

import {
  getUsersForKlaviyoResetPreview,
  getSyncProgress,
  type PreviewResult,
} from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export type KlaviyoDrawResetPreview = PreviewResult;

export interface KlaviyoDrawResetProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  synced: number;
  errors: number;
  currentUserEmail?: string;
  startTime?: number;
}

/** Preview which users would be synced by a draw reset, without performing it. */
export async function getKlaviyoDrawResetPreview(): Promise<KlaviyoDrawResetPreview> {
  return getUsersForKlaviyoResetPreview();
}

/**
 * Current in-flight progress of a manual draw-reset sync, or `null` when no
 * sync is in progress on this process. Progress state is held in-memory by the
 * underlying util — see G2 in docs/internal-norm/gotchas.md for caveats.
 */
export function getKlaviyoDrawResetProgress(): KlaviyoDrawResetProgress | null {
  return getSyncProgress();
}
