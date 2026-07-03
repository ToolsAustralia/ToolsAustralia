import type { PipelineStage, Types } from "mongoose";
import BlockedTransaction from "@/models/BlockedTransaction";
import type { IAllowlistAction } from "@/models/AllowlistAction";
import type { ApplySource, EvalInput, EvalResult } from "./types";
import { getAllowlistService } from "./index";

/** Scope of a reconcile sweep. Phase 0 uses "customers"; script/future cron use "window". */
export type ReconcileScope =
  | { kind: "customers"; stripeCustomerIds: string[]; emails?: string[] }
  | { kind: "window"; since?: Date; limit?: number };

export type ReconcileSummary = {
  evaluated: number;
  added: number;
  alreadyAllowlisted: number;
  skipped: { fraud: number; permanent: number; notMember: number };
  errored: number;
};

/** The subset of AllowlistService the loop needs — lets tests pass a fake. */
export interface AllowlistApplier {
  isAllowlisted(cardFingerprint: string): Promise<boolean>;
  evaluate(input: EvalInput): Promise<EvalResult>;
  apply(
    input: EvalInput,
    source: ApplySource,
    performedByUserId: Types.ObjectId | null,
    allowOverride?: boolean
  ): Promise<IAllowlistAction>;
}

export type ReconcileItemOutcome = "added" | "already" | "skipped" | "errored";

export type ReconcileOptions = {
  performedByUserId: Types.ObjectId | null;
  /** true → call evaluate() only (no Stripe/DB writes). */
  dryRun?: boolean;
  /** Delay between live applies (Stripe rate-limit headroom). Default 100ms. */
  throttleMs?: number;
  /** App-level 429 retry budget per fingerprint. Default 3. */
  maxRetries429?: number;
  /** Injectable for tests. Defaults to the process singleton. */
  service?: AllowlistApplier;
  onProgress?: (p: { processed: number; total: number; added: number }) => void;
  onItem?: (r: { input: EvalInput; outcome: ReconcileItemOutcome; reason?: string }) => void;
  /** Injectable for tests (avoid real delays). */
  sleepFn?: (ms: number) => Promise<void>;
};

const DEFAULT_THROTTLE_MS = 100;
const DEFAULT_MAX_RETRIES_429 = 3;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getRetryAfterMs(err: unknown, attempt: number): number {
  const raw =
    err && typeof err === "object" && "raw" in err
      ? (err as { raw?: { headers?: Record<string, string> } }).raw
      : undefined;
  const retryAfter = raw?.headers?.["retry-after"];
  if (retryAfter != null) {
    const sec = parseInt(retryAfter, 10);
    if (!Number.isNaN(sec)) return Math.min(sec * 1000, 60_000);
  }
  return 5000 * Math.pow(2, attempt);
}

function bucketReason(reason: string, s: ReconcileSummary["skipped"]): void {
  if (reason === "filter_fraud_signal") s.fraud += 1;
  else if (reason === "filter_permanent_issue") s.permanent += 1;
  else if (reason === "filter_not_member") s.notMember += 1;
}

type BlockedLatest = {
  paymentIntentId: string;
  chargeId: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
};

/**
 * Aggregate `blockedtransactions` down to one EvalInput per unique card
 * fingerprint (most-recent block wins — freshest customer/decline context).
 */
export async function loadBlockedFingerprints(scope: ReconcileScope): Promise<EvalInput[]> {
  const match: Record<string, unknown> = {};
  if (scope.kind === "customers") {
    const or: Array<Record<string, unknown>> = [];
    if (scope.stripeCustomerIds.length) or.push({ stripeCustomerId: { $in: scope.stripeCustomerIds } });
    if (scope.emails?.length) or.push({ customerEmail: { $in: scope.emails } });
    if (or.length === 0) return [];
    match.$or = or;
  } else if (scope.since) {
    match.createdAt = { $gte: scope.since };
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$cardFingerprint", latest: { $first: "$$ROOT" } } },
  ];
  if (scope.kind === "window" && scope.limit && Number.isFinite(scope.limit)) {
    pipeline.push({ $limit: scope.limit });
  }

  const groups = await BlockedTransaction.aggregate<{ _id: string; latest: BlockedLatest }>(pipeline);
  return groups.map((g) => ({
    cardFingerprint: g.latest.cardFingerprint,
    cardLast4: g.latest.cardLast4,
    cardBrand: g.latest.cardBrand,
    stripeCustomerId: g.latest.stripeCustomerId,
    customerEmail: g.latest.customerEmail,
    declineCode: g.latest.declineCode,
    failureCode: g.latest.failureCode,
    triggeringPaymentIntentId: g.latest.paymentIntentId,
    triggeringChargeId: g.latest.chargeId,
  }));
}

/**
 * Core loop: for each unique fingerprint, skip if already allowlisted, else
 * apply() (or evaluate() in dryRun). Eligibility gating + Stripe write live in
 * apply(). Pure w.r.t. Mongo — takes pre-loaded inputs and an injectable service.
 */
export async function reconcileBlockedFingerprints(
  inputs: EvalInput[],
  opts: ReconcileOptions
): Promise<ReconcileSummary> {
  const service = opts.service ?? getAllowlistService();
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const maxRetries429 = opts.maxRetries429 ?? DEFAULT_MAX_RETRIES_429;
  const sleepFn = opts.sleepFn ?? realSleep;
  const dryRun = opts.dryRun ?? false;

  const summary: ReconcileSummary = {
    evaluated: 0,
    added: 0,
    alreadyAllowlisted: 0,
    skipped: { fraud: 0, permanent: 0, notMember: 0 },
    errored: 0,
  };

  for (const input of inputs) {
    summary.evaluated += 1;

    if (await service.isAllowlisted(input.cardFingerprint)) {
      summary.alreadyAllowlisted += 1;
      opts.onItem?.({ input, outcome: "already" });
      opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
      continue;
    }

    if (dryRun) {
      try {
        const r = await service.evaluate(input);
        if (r.eligible) {
          summary.added += 1;
          opts.onItem?.({ input, outcome: "added" });
        } else {
          bucketReason(r.reason, summary.skipped);
          opts.onItem?.({ input, outcome: "skipped", reason: r.reason });
        }
      } catch (err) {
        summary.errored += 1;
        opts.onItem?.({ input, outcome: "errored", reason: err instanceof Error ? err.message : String(err) });
      }
      opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
      continue;
    }

    // Live: apply() with app-level 429 retry.
    let attempt = 0;
    for (;;) {
      try {
        const action = await service.apply(input, "admin_bulk", opts.performedByUserId, false);
        if (action.action === "added") {
          summary.added += 1;
          opts.onItem?.({ input, outcome: "added" });
        } else if (action.action === "skipped") {
          bucketReason(action.reason, summary.skipped);
          opts.onItem?.({ input, outcome: "skipped", reason: action.reason });
        }
        break;
      } catch (err) {
        const status =
          (err as { statusCode?: number; status?: number } | null)?.statusCode ??
          (err as { statusCode?: number; status?: number } | null)?.status;
        if (status === 429 && attempt < maxRetries429) {
          attempt += 1;
          await sleepFn(getRetryAfterMs(err, attempt));
          continue;
        }
        summary.errored += 1;
        opts.onItem?.({ input, outcome: "errored", reason: err instanceof Error ? err.message : String(err) });
        break;
      }
    }
    await sleepFn(throttleMs);
    opts.onProgress?.({ processed: summary.evaluated, total: inputs.length, added: summary.added });
  }

  return summary;
}

/** Load the scope's blocked fingerprints, then reconcile them. */
export async function reconcileAllowlistFromBlocked(
  scope: ReconcileScope,
  opts: ReconcileOptions
): Promise<ReconcileSummary> {
  const inputs = await loadBlockedFingerprints(scope);
  return reconcileBlockedFingerprints(inputs, opts);
}
