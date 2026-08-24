# Billing-Stripe — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:anchor-billing` | The anchor-billing helper (default suite — `npm test` runs this). |
| `npm run test:stripe-collection-pause` | Pause-collection policy + invoice-selection helpers. |
| `npm run test:facebook-capi` | Lives in [tracking](../tracking/) but exercises Stripe-driven event firing. |
| `npm run test:redeemables` | Lives in [rewards-redeemables](../rewards-redeemables/) but covers the reverser-step pattern. |
| `npm run test:webhook-queue-backoff` | Exponential backoff calculator for webhook retry scheduling. |
| `npm run test:webhook-queue-enqueue` | Idempotent Stripe event enqueueing and duplicate handling. |
| `npm run test:webhook-queue-claim` | Atomic claim guarantees one-winner among parallel workers. |
| `npm run test:webhook-queue-mark-result` | Success / fail / dead-letter state transitions for queue rows. |
| `npm run test:webhook-queue-orphan-recovery` | Sweeper recovers in-flight rows stuck in `processing`. |
| `npm run test:webhook-queue-replay-safe` | No-double-grant on replay (4-layer dedup load-bearing test). |
| `npm run test:renewal-grant-reconciler` | **The paid-but-not-granted detector.** 25 assertions against a seeded 2019 window on the dev cluster. *Anti-join:* a paid `subscription_cycle` with no `BenefitsGranted` is reported; one WITH its grant is not; `failed` cycles, non-`subscription_cycle` invoices and rows whose `updatedAt` is outside the window are not; the row carries `userId`/`amountPaidCents`/`chargedAt`; inserting the missing grant clears it (the "is the backfill done?" signal). ***Dunning recovery — the load-bearing case:*** drives the REAL `upsertRenewalCycleFromFailedInvoice` → `upsertRenewalCycleFromPaidInvoice` pair and asserts `createdAt` stays pinned to the FAILURE date while `updatedAt` is bumped by the flip, then that the recovered renewal IS detected — by both a live-clock window and the fixture window — while `createdAt` sits outside it. A `createdAt` window would report clean here forever. Also pins that `status: "recovered"` counts as money kept. *Plus:* a `dead` queue row is reported with its `lastError` while a `queued` one is not, and the orchestrator's totals + echoed window are correct. Needs `MONGODB_URI`. |
| `npm run test:stripe-rate-limiter` | **The client-side token bucket + the transparency of its HTTP shim.** No network, no DB, ~3s. *Limiter:* the 3rd acquire at 2/sec waits ≥400ms, with a **negative control** (the same three acquires on a disabled limiter finish in <100ms) so the assertion cannot pass on a limiter that does nothing; per-endpoint and global buckets are independent; the rate is sustained past the opening burst; 8 concurrent acquires all resolve FIFO with `queued === 0` and `timerPending === false` afterwards (no deadlock, no leaked timer); a sub-1/sec rate still makes progress. Plus `endpointKeyFromPath` (query strings stripped, v2 nests deeper) and the env parsing (live 80/20, sandbox 20/20, override, explicit `0`, garbage → default). ***Transparency — the load-bearing half:*** drives the REAL Stripe SDK through the shim against a scripted fake transport and pins that nothing but timing changed — a 3-deep namespace (`testHelpers.testClocks.retrieve`), the per-call options object (`{ idempotencyKey }` → the `Idempotency-Key` header), `for await` **auto-pagination across two pages** (the case a `Proxy` breaks) including the SDK's own `starting_after` follow-up, `lastResponse.requestId`, the **synchronous** `webhooks.constructEvent` (asserted to have no `.then`), and error propagation for 400 `StripeInvalidRequestError` (code/statusCode/requestId), 402 `StripeCardError` (`decline_code`) and 429 `StripeRateLimitError` — the limiter must reduce 429s, never hide one. |
| `npm run test:ack-gate` | **The ACK gate.** A renewal whose entry grant did not complete must never be marked `succeeded` or written to `ProcessedStripeEvent`. 6 cases / 27 assertions. A/B drive the `deps` seam (B pins that ordinary non-payment events still succeed — gating on `shouldMarkAsProcessed` would dead-letter 25 of the dispatcher's 27 `case` labels). C–F drive the real dispatcher + handler with only `stripe.invoices.retrieve` stubbed: C = a Stripe 429 must requeue with the real error in `lastError`; D = the $0 trial-bookkeeping invoice must still ACK **and** write its dedup row; E = a non-subscription invoice for an unknown customer ACKs; F = a *subscription* invoice for an unknown customer stays retryable (the signup / SCA-3DS race) with its specific reason in `lastError`. Needs `MONGODB_URI` — it seeds and cleans real `stripewebhookqueue` rows. |

## Test conventions

Per CLAUDE.md, this repo has **no jest/vitest**. Tests are standalone tsx scripts under `src/**/__tests__/*.test.ts`. Each test needs a matching `test:*` entry in `package.json` to be discoverable.

When adding a new test in this domain:
1. Place under `src/services/.../__tests__/` or `src/utils/payment/__tests__/`.
2. Add a `test:<name>` entry to `package.json`.
3. Verify with `npm run test:<name>`.

## DST regression

[scripts/test-dst-transitions.ts](../../scripts/test-dst-transitions.ts) — exercises anchor-billing across Sydney DST start/end.

Run: `npx tsx scripts/test-dst-transitions.ts`.

> _TODO: merge content from root-level `TESTING-TIMEZONE-DST.md` here when refreshing._

## Manual smoke (Stripe CLI)

```bash
# Forward webhook events to local
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger a renewal failure
stripe trigger invoice.payment_failed
```

Then verify:
- `ProcessedStripeEvent` row created (dedupe)
- `MembershipStatusHistory` row written with `source: "webhook_invoice_payment_failed_renewal"` (or similar)
- `pause_collection: keep_as_draft` set on the test subscription in Stripe Dashboard

## What's NOT well-tested

- Webhook handler integration (no end-to-end harness; rely on Stripe CLI smoke).
- `processRefundReversal` end-to-end — pure-helper unit tests cover the reverser steps but the orchestration is exercised only in production.
- The ~25 `/api/stripe/**` route handlers — each handler should have at least a contract test covering Zod validation, auth gating, and happy-path.

> _TODO: enumerate any specific gaps as the test suite grows._
