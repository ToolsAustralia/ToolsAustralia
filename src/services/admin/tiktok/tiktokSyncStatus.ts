import TikTokSyncRun from "@/models/TikTokSyncRun";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { isTikTokAdInsightsConfigured, TikTokReportError } from "./tiktokAdInsights";

/** One jobKey today; keep as a constant so the cron and the reader can never drift. */
const SYNC_TIKTOK_ADS_JOB_KEY = "sync-tiktok-ads";

export interface TikTokSyncRunSummary {
  outcome: "ok" | "error";
  errorCode: number | null;
  errorMessage: string | null;
  rowsUpserted: number | null;
  since?: string;
  until?: string;
  finishedAt: string; // ISO — serialized over the admin API
}

/**
 * What the admin UI needs to render a TRUTHFUL TikTok sync state (panel F-002):
 * "not connected" vs "failing since X because Y" vs "synced, genuinely no spend".
 */
export interface TikTokSyncHealth {
  configured: boolean;
  /** Latest run outcome — null until the cron (or seed script) has run once. */
  lastRun: TikTokSyncRunSummary | null;
  /** Most recent row write (max syncedAt) — proof data actually landed. ISO or null. */
  lastSyncedAt: string | null;
}

/**
 * Upsert the single status doc for the nightly sync. Best-effort by design: recording
 * status must never break the cron itself (a failed write here is logged and swallowed).
 */
export async function recordTikTokSyncRun(run: {
  outcome: "ok" | "error";
  error?: unknown;
  rowsUpserted?: number;
  since?: string;
  until?: string;
  durationMs?: number;
}): Promise<void> {
  try {
    const err = run.error;
    await TikTokSyncRun.updateOne(
      { jobKey: SYNC_TIKTOK_ADS_JOB_KEY },
      {
        $set: {
          outcome: run.outcome,
          errorCode: err instanceof TikTokReportError ? (err.tiktokCode ?? null) : null,
          errorMessage:
            run.outcome === "error"
              ? err instanceof Error
                ? err.message
                : String(err ?? "unknown error")
              : null,
          rowsUpserted: run.rowsUpserted ?? null,
          since: run.since,
          until: run.until,
          durationMs: run.durationMs,
          finishedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.error("[tiktokSyncStatus] failed to record sync run (non-fatal):", e);
  }
}

/** Read the health snapshot for the admin TikTok surfaces. */
export async function getTikTokSyncHealth(): Promise<TikTokSyncHealth> {
  const [runDoc, latestRow] = await Promise.all([
    TikTokSyncRun.findOne({ jobKey: SYNC_TIKTOK_ADS_JOB_KEY }).lean<{
      outcome: "ok" | "error";
      errorCode?: number | null;
      errorMessage?: string | null;
      rowsUpserted?: number | null;
      since?: string;
      until?: string;
      finishedAt: Date;
    }>(),
    TikTokAdInsightsDaily.findOne({}).sort({ syncedAt: -1 }).select("syncedAt").lean<{
      syncedAt?: Date;
    }>(),
  ]);

  return {
    configured: isTikTokAdInsightsConfigured(),
    lastRun: runDoc
      ? {
          outcome: runDoc.outcome,
          errorCode: runDoc.errorCode ?? null,
          errorMessage: runDoc.errorMessage ?? null,
          rowsUpserted: runDoc.rowsUpserted ?? null,
          since: runDoc.since,
          until: runDoc.until,
          finishedAt: runDoc.finishedAt.toISOString(),
        }
      : null,
    lastSyncedAt: latestRow?.syncedAt ? latestRow.syncedAt.toISOString() : null,
  };
}
