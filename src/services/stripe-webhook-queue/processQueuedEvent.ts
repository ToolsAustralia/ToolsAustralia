import type Stripe from "stripe";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { claimNextAttempt } from "@/services/stripe-webhook-queue/claim";
import { markFailed, markSucceeded } from "@/services/stripe-webhook-queue/markResult";
import {
  ackProcessedStripeEventOnce,
  dispatchStripeEvent,
  type StripeDispatchResult,
} from "@/services/stripe-webhook-handlers";

export interface ProcessQueuedEventResult {
  processed: boolean;
  skipped?: "not_claimable" | "already_processed";
  error?: string;
}

interface ProcessDeps {
  dispatch: (event: Stripe.Event) => Promise<StripeDispatchResult>;
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
    const { shouldMarkAsProcessed, handlerFailed } = await deps.dispatch(payload);

    // ACK GATE (2026-08-24). A handler that returns normally is not automatically a
    // success: `handlerFailed` means it ran to completion but did NOT do its work — a
    // renewal whose entry grant never landed. Marking that row `succeeded` is what let
    // 11 members be charged $300.00 with no entries and no retry on 2026-08-23.
    //
    // Gate on `handlerFailed`, NOT on `shouldMarkAsProcessed`: the latter only asks
    // "write the ProcessedStripeEvent dedup row?", and ~19 of the 21 subscribed event
    // types legitimately leave it false. Gating on it would dead-letter all of them.
    //
    // Never ACK an ungranted event into ProcessedStripeEvent either — that unique row
    // is precisely what blocks a later Stripe replay from healing the member.
    if (handlerFailed) {
      await markFailed(eventId, "handler reported grant did not complete");
      return { processed: false, error: "not_granted" };
    }

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
