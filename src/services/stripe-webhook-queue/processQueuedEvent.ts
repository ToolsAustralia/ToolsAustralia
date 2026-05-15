import type Stripe from "stripe";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { claimNextAttempt } from "@/services/stripe-webhook-queue/claim";
import { markFailed, markSucceeded } from "@/services/stripe-webhook-queue/markResult";
import {
  ackProcessedStripeEventOnce,
  dispatchStripeEvent,
} from "@/services/stripe-webhook-handlers";

export interface ProcessQueuedEventResult {
  processed: boolean;
  skipped?: "not_claimable" | "already_processed";
  error?: string;
}

interface ProcessDeps {
  dispatch: (event: Stripe.Event) => Promise<{ shouldMarkAsProcessed: boolean }>;
}

const defaultDeps: ProcessDeps = { dispatch: dispatchStripeEvent };

/**
 * Process a single queued Stripe webhook row in-process. Single source of
 * truth replacing the deleted /api/stripe/process-event HTTP worker route.
 * Called from the receiver's after(), the sweeper cron, and admin Replay.
 *
 * The `deps` seam exists solely so the state machine can be unit-tested
 * without executing the 4,800-line handler. Production always uses defaults.
 */
export async function processQueuedEvent(
  eventId: string,
  deps: ProcessDeps = defaultDeps
): Promise<ProcessQueuedEventResult> {
  const row = await claimNextAttempt(eventId);
  if (!row) return { processed: false, skipped: "not_claimable" };

  // Safe cast: payload was Stripe-signature-verified before it was enqueued.
  const payload = row.payload as Stripe.Event;

  // Relocated layer-2 dedup (was inline in the receiver pre-refactor).
  // Stripe dashboard *resends* carry a fresh event.id and bypass enqueue
  // idempotency, so this short-circuit must run on the processing path.
  const alreadyProcessed = await ProcessedStripeEvent.findOne({
    eventId: payload.id,
  }).lean();
  if (alreadyProcessed) {
    await markSucceeded(eventId);
    return { processed: false, skipped: "already_processed" };
  }

  try {
    const { shouldMarkAsProcessed } = await deps.dispatch(payload);
    if (shouldMarkAsProcessed) {
      await ackProcessedStripeEventOnce(payload);
    }
    await markSucceeded(eventId);
    return { processed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(eventId, message);
    return { processed: false, error: message };
  }
}
