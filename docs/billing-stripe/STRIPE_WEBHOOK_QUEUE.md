# Stripe Webhook Async Queue

> **Status:** In progress — full documentation lands in Task 16 of the implementation plan. See [docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md) for design.

## Overview

Stripe webhook events are received by a thin receiver that returns 200 in <1s, then processed asynchronously by a worker route with a 300s budget. A Mongo-backed queue (`stripewebhookqueue` collection) buffers events between receiver and worker. A cron sweeper retries failed events with exponential backoff and recovers orphaned in-flight rows.

## Worker Route

### `/api/stripe/process-event` (POST)

The worker route processes queued Stripe events.

**Request:**
- Headers: `x-internal-secret` — must match `process.env.STRIPE_WORKER_INTERNAL_SECRET` (32+ char string)
- Body: `{ eventId: string }`

**Processing flow:**
1. Authenticates the caller via the secret header
2. Validates the `eventId` parameter
3. Calls `claimNextAttempt(eventId)` — atomically reserves the queue row for processing
   - If the row is already being processed or does not exist, returns `{ skipped: true, reason: "not_claimable" }`
4. Dispatches the event to the handler via `dispatchStripeEvent(payload)`, which returns `{ shouldMarkAsProcessed }`
5. If the handler marked it for acknowledgment, calls `ackProcessedStripeEventOnce(payload)` to mark the event as fully processed in `ProcessedStripeEvent`
6. Marks the queue row as succeeded via `markSucceeded(eventId)`
7. Returns `{ processed: true }`

**Error handling:**
- If the handler throws, catches the error and calls `markFailed(eventId, errorMessage)`
- Returns `{ processed: false, error: message }` with **status 200** (intentionally not 5xx)
- Returning 200 tells the caller (sweeper or receiver) that we've recorded the failure internally; the queue row is already scheduled for the next retry attempt
- The sweeper will eventually retry via exponential backoff, not HTTP-layer retries

**Configuration:**
- Requires `STRIPE_WORKER_INTERNAL_SECRET` env var set to a random 32+ character string
- Must be called with the correct secret to prevent unauthorized event processing
