# Past-Due Charge — Phase 0 Allowlist Sweep (Design)

- **Date:** 2026-07-03
- **Status:** Approved design — pending implementation plan
- **Domains touched:** `admin`, `billing-stripe`
- **Related docs:** `docs/billing-stripe/gotchas.md` (§"Stripe issuer-directed auto-block + allowlist override", §"Past-due bulk charge hitting blocked-card failures"), `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `scripts/sync-allowlist-from-blocked-transactions.ts`

## Problem

When an admin runs **Charge Past Due Customers**, the charge chain (`startChargePastDueJob` → `processChargePastDueChunk` → `payOpenInvoiceAsPastDueAdmin` → `stripe.invoices.pay`) is completely decoupled from the allowlist system. If a paying member's card was **auto-blocked** by Stripe/Radar (`charge.outcome.type === "blocked"` or `network_status === "declined_by_network"`), the retry hits that block again and fails at Stripe — burning a blocked-decline fee and collecting nothing — **unless the card fingerprint is already on the `card_fingerprint_allowlist` Radar value list.**

Today that allowlisting happens only via:
1. the real-time `payment_intent.payment_failed` webhook (best-effort; swallows failures; does not fire for `charge.failed`-only blocks), and
2. the **one-time** `scripts/sync-allowlist-from-blocked-transactions.ts` catch-up.

So a residual set of *eligible-but-not-yet-allowlisted* cards continually re-accumulates (webhook failures, `charge.failed`-only blocks, members who became eligible after being skipped) and silently fails on the next charge run. The current documented workaround is to manually re-run the sync script before charging.

## Production baseline (measured 2026-07-03, read-only dry-run against `Production`)

455 unique blocked card fingerprints total:

| Bucket | Count |
|---|---|
| Already allowlisted | 422 |
| **Eligible, not yet allowlisted (Phase 0 would add)** | **9** |
| Skipped — fraud signal | 2 |
| Skipped — not a member | 22 |
| Skipped — permanent issue | 0 |
| Errored | 0 |

The system is already ~93% covered by the webhook + prior sync. The value of this feature is not a large one-time recovery — it is **automating the residual capture at the exact moment of the charge run**, eliminating the manual pre-run sync and running down a leak that otherwise keeps refilling.

## Goals

- Before any charge in a bulk past-due run, allowlist every **eligible** blocked card belonging to that run's population, so the subsequent `invoices.pay` reaches the issuer instead of dying at Stripe.
- Reuse the existing eligibility gate exactly (paying member **and** not fraud-signal **and** not permanent-issue). No new eligibility rules.
- Do it as a first-class, reusable reconciliation unit — not inline copy-paste — so the same core can later back a cron with near-zero cost.
- Never let allowlisting failures block or slow collection.

## Non-goals (deliberately out of scope — see "Why deferred")

- No scheduled cron. (Phase 0 already sweeps the residual every time the admin charges, which is ~daily.)
- No change to the webhook's best-effort behavior; no allowlist retry queue.
- No allowlisting from the `charge.failed` branch.
- No change to `payOpenInvoiceAsPastDueAdmin` or the eligibility/decline-code classification.
- No auto-allowlisting of fraud-signal / permanent-issue / non-member cards. These stay skipped.

## Design

### Core unit — `reconcileAllowlistFromBlocked(scope)` (new)

New service function in `src/services/allowlist/` that encapsulates the sweep currently inlined in the sync script.

**Input (discriminated scope):**
- `{ kind: "customers", stripeCustomerIds: string[], emails: string[] }` — Phase 0 (targeted to a run's population).
- `{ kind: "window", since?: Date, limit?: number }` — the existing script (full/near-full history); reserved for a future cron.

**Behaviour:**
1. Aggregate `BlockedTransaction` for the scope → one row per unique `cardFingerprint`, most-recent block wins (carries freshest customer/decline context). For `kind: "customers"`, the aggregation is prefixed with a `$match` on `stripeCustomerId ∈ stripeCustomerIds` (and/or `customerEmail ∈ emails`).
2. For each fingerprint, short-circuit if an active `added` `AllowlistAction` already exists (no Stripe call).
3. Otherwise call `AllowlistService.apply(evalInput, "admin_bulk", performedByUserId)` — the existing method already does eligibility gating, the Stripe `valueListItems.create`, idempotency, and audit-row writes. `allowOverride` is **false** (Phase 0 never overrides the filter).
4. Throttle between Stripe writes (reuse the script's ~50–100ms delay) for rate-limit headroom.
5. Return `{ evaluated, added, alreadyAllowlisted, skipped: { fraud, permanent, notMember }, errored }`.

**Refactor:** `scripts/sync-allowlist-from-blocked-transactions.ts` is rewritten to call this function (`kind: "window"`) instead of holding its own aggregation + apply loop. Removes duplication; the script keeps its CLI/dry-run/summary shell.

### Trigger wired now — Phase 0 inside `startChargePastDueJob`

`startChargePastDueJob` already acquires the lock and **snapshots the eligible worklist without charging**, then returns `{ runId, total, done }`. Phase 0 slots in **after the worklist snapshot, before that return**:

1. Collect the distinct `stripeCustomerId`s (and emails as fallback) from the snapshot worklist.
2. Call `reconcileAllowlistFromBlocked({ kind: "customers", stripeCustomerIds, emails }, performedByUserId: <adminId>)`.
3. Attach the returned summary to the run (persisted on the run doc / returned from `start`).
4. Return as today. The client then drives `chunk` calls, which charge — now against a freshly-allowlisted population.

No change to `payOpenInvoiceAsPastDueAdmin`. The dependency direction is `server/admin → services/allowlist` (clean; the allowlist service never imports back).

### Ordering guarantee (propagation safety)

The **entire** allowlist sweep for the run completes during `start`, before the first `chunk` charges. A card's allowlist add and its charge are therefore never back-to-back; the whole sweep's duration (plus the network round-trips of `start` → first `chunk`) gives Radar value-list additions time to propagate. This holds whether Stripe's propagation is effectively instant or takes seconds.

## Data flow

```
POST { action: "start", confirmation: "CHARGE" }
  → startChargePastDueJob(adminId)
      → acquire lock
      → snapshot eligible worklist            (existing)
      → PHASE 0: reconcileAllowlistFromBlocked({customers from worklist})
            → BlockedTransaction aggregate (scoped, unique fingerprint)
            → per fp: skip if already added, else AllowlistService.apply(...)
            → summary { added, alreadyAllowlisted, skipped, errored }
      → create run (store phase0 summary)
      → return { runId, total, done, allowlist: <summary> }
POST { action: "chunk", runId } × N
  → processChargePastDueChunk → payOpenInvoiceAsPastDueAdmin → stripe.invoices.pay   (unchanged)
```

## Error handling & idempotency

- **Per-fingerprint `try/catch`.** A failed `apply()` increments `errored`, is logged with `console.error` (survives the prod console-strip), and the sweep continues. Phase 0 as a whole is wrapped so that **any** failure in the sweep is logged and the run proceeds to charging regardless — allowlisting must never block collection.
- **Idempotent.** `apply()` short-circuits fingerprints already on the list; re-running `start` (resumable runs) re-evaluates cheaply. Fraud/permanent decline codes short-circuit in `evaluate()` before any DB/Stripe lookup, so re-checking permanently-ineligible cards is nearly free.

## Observability

- `start` returns the Phase 0 summary; `ChargePastDueModal` surfaces it (e.g. "9 cards allowlisted before charging; 24 skipped"). Scope of the modal change: one summary line — no redesign.
- Adds/skips continue to write audited `AllowlistAction` rows (existing behavior of `apply()`). No new collection.

## Expected result

- Each run, eligible paying members whose blocked cards were not yet allowlisted (webhook failures, `charge.failed`-only blocks, newly-eligible members) are allowlisted first, so their `invoices.pay` retry reaches the issuer.
- Blocked-decline outcomes on the run trend toward zero **for eligible members** → fewer wasted decline fees, more collection on previously-uncollectable cards.
- Fraud-signal, permanent-issue, and non-member cards remain skipped → **no new chargeback exposure**.
- No effect on ordinary `insufficient_funds` / `do_not_honor` declines (never the blocked-card problem).
- Today's snapshot: **9** cards would be newly allowlisted-and-charged; the number is a moving residual, not a one-time total.

## Why the non-goals are deferred (not corner-cutting)

The allowlist is *derived state* that drifts because event writes can fail/not-fire. The scalable fix is a reconciliation loop, which this codebase already uses (`reconcile-*` crons, webhook queue). `reconcileAllowlistFromBlocked` **is** that loop; Phase 0 is its highest-leverage trigger. Because the core is a clean, reusable unit:
- A future **cron** = one `vercel.json` line + a thin route calling the same function with `kind: "window"`. Add only if Stripe's *own* automatic dunning retries (between manual runs) prove to leak blocked fees — Phase 0 cannot cover those.
- The **webhook retry queue** and **`charge.failed` allowlisting** are subsumed by reconciliation's re-derivation, so building them now would be redundant machinery.

## Testing

- New tsx test `test:allowlist-reconcile` for `reconcileAllowlistFromBlocked`: eligibility bucketing (fraud / permanent / not-member / eligible), `already-added` short-circuit, `customers` vs `window` scoping, and summary tallies — using stubbed repo + a fake `stripeRadar`.
- Reuse existing `AllowlistService` tests (unchanged behavior).
- Manual: `npm run sync:allowlist-from-blocked:dry` after the refactor must reproduce the same buckets it does today (regression guard on the extraction).

## Docs & manifest touchpoints (implementation checklist)

- `docs/billing-stripe/gotchas.md` — update the "Past-due bulk charge hitting blocked-card failures" section: the manual pre-run sync is now automated as Phase 0.
- `docs/admin/` — note Phase 0 in the charge-past-due flow + the new modal summary line.
- `BUSINESS.md` — the past-due recovery flow changes behavior (allowlist-then-charge). Per CLAUDE.md §5 a past-due-recovery-flow change is a business trigger, so update `BUSINESS.md` §9 in the implementing turn (verify against the doc-sync hook's `BUSINESS_TRIGGER_GLOBS` — it may also block until a root doc is touched).
- **Norm:** no change — no admin read shape changes and no new admin GET route (Phase 0 rides inside the existing `start`).
- Manifest: `reconcileAllowlistFromBlocked` under `src/services/allowlist/**` (billing-stripe domain, already mapped); `startChargePastDueJob` under `src/server/admin/**` (admin domain, already mapped). No new manifest entries.

## Open risks

- **`start` request duration.** Phase 0 runs inside the `start` request (300s budget). Bounded by unique blocked fingerprints among the worklist customers, most of which short-circuit; today that is single digits of real Stripe writes. If this ever grows large, promote Phase 0 to its own pre-chunk action driven by the client loop. Not needed now.
- **Customer↔block join.** Phase 0 matches `BlockedTransaction` by `stripeCustomerId` (both Stripe-sourced, reliable), with `customerEmail` as fallback. A block with neither will not be swept by Phase 0 — but such rows are already unactionable by the eligibility gate.
