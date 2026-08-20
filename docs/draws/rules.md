# Draws — Rules

## Status & transitions

### R1. The transition service is the only authority

`major-draw-transition-service.ts` is the single place where major-draw status changes happen. Don't `updateMany({ status: ... })` in any other code. The service:
- Is idempotent
- Has timeout protection (`maxTimeMS: 5000`)
- Is debounced (5s per lambda)
- Never throws (returns `TransitionResult` object)
- Adds query comments for Atlas profiling

### R2. Run the transition service before reading status

`getTargetMajorDraw()` calls the transition service at the top. Do the same in any new code that depends on fresh draw status. Otherwise stale `queued` rows can be selected when they should be `active`.

### R3. Cron is authoritative; webhook is best-effort

The cron at 1:30 UTC is the **fallback authority** for transitions. The webhook also calls the service but its failure must not block payment processing. Cron will catch up.

### R3a. New-entry purchases require `status: "active"` — the blackout covers freeze AND gap

The gate for **new-entry purchases** (not renewals) is `currentMajorDraw?.status === "active"`. There are two windows where this is false:

- **Freeze (8:00–8:30 PM, 27th)** — current draw is `frozen`.
- **Gap (8:30 PM → 12:00 AM, 27th → 28th)** — current draw is `completed`, next is still `queued` (no row has `status: "active"`).

Together they form a **~4-hour purchase blackout** every cycle. Don't write code that assumes the blackout is only the 30-minute freeze. The single source of truth on the frontend is [`useMajorDrawPurchaseGate`](../../src/hooks/useMajorDrawPurchaseGate.ts); on the backend it is [`enforceMajorDrawOpenForNewPurchasesOr403`](../../src/utils/draws/major-draw-gate-http.ts) (which wraps `checkMajorDrawActiveForNewPurchases` → `getActiveMajorDrawForNewEntryPurchases`, both in [`major-draw-helpers.ts`](../../src/utils/draws/major-draw-helpers.ts)). Both return the same answer **whenever the client actually knows the draw status** — they share the same `status === "active"` predicate. They deliberately diverge in exactly one case: when the client's `useCurrentMajorDraw` query **errors**, the frontend gate fails **open** (`!isError && …`) and lets the request reach the server, which then applies the authoritative check and 403s if the gate really is shut. The server is the boundary; the client gate is a UX affordance that must never block a paying customer because of our own outage. See [gotchas.md](./gotchas.md#the-purchase-gate-failed-closed-on-an-api-error-2026-08-03).

**Renewals are different.** Subscription-renewal allocation uses [`getTargetMajorDraw`](../../src/utils/draws/major-draw-helpers.ts), which has explicit "freeze" and "no active draw (gap period)" branches that route to the next queued draw. Renewals are not blocked during the blackout — they're re-targeted. If you add a new purchase-path entry point, decide explicitly: is it a *new-entry purchase* (call the gate, 403 the user) or a *renewal-style allocation* (call `getTargetMajorDraw`, route forward).

## Eligibility

### R4. Subscriptions anchor renewals to the 24th to leave 3-day failed-renewal recovery window

See [subscription R11-R13](../subscription/rules.md#billing-anchor-24th). Major-draw window is 28th–27th; anchoring the 24th gives ≥3 days to recover from a failed renewal before draw eligibility freezes.

### R5. Eligibility checks go through `giveaway-eligibility.ts`

Don't reimplement the membership-state-to-eligibility logic per route or component. Use the shared helper.

It holds **all three** terms exclusions, deliberately in one module — splitting them is how one gets forgotten at a new entry point:

| Exclusion | Helper | Axis |
| --- | --- | --- |
| SA / ACT residents | `isGiveawayIneligible` / `getGiveawayIneligibilityReasons` | profile (state) |
| Under 18 | same | profile (birthdate) |
| **Tools Australia employees** (Terms §5.5) | `isEmployeeAccount(userType)` | **account** |

`isEmployeeAccount` is **not** folded into `isGiveawayIneligible`: that one answers a *profile* question for form validation and its callers pass fields collected from the user. An internal account is a different axis and is checked at the **purchase boundary** — `POST /api/mini-draw/purchase` returns 403 for `userType` `"staff"` or `"admin"`.

Read it from the **User document, not `session.user.userType`** — the session is a JWT that still says `"customer"` until it refreshes, so a claim-based check lets a newly-promoted staff account through.

⚠️ This gate used to be an accident: staff were kept off `/mini-draws` by the middleware block-list, which prevented the purchase as a side effect. That block was lifted on 2026-08-20 so staff could open the draw page the admin UI links to. See [security-csp gotchas](../security-csp/gotchas.md).

## Tickets & entries

### R6. Entry refunds go through `remove-draw-entries.ts`

When refunding a payment that granted draw entries, call `remove-draw-entries.ts` from the reverser flow ([payment patterns P1](../payment/patterns.md#p1-reverser-modules-per-grant-type)). Don't direct-delete `TicketEntry` rows from refund handlers.

### R7. Purchase cooldown blocks rapid-fire abuse

`src/lib/purchaseCooldown.ts` enforces a min-time between consecutive purchases per user. Don't bypass for test accounts in production.

## Winners & display

### R8. Public-facing winner names go through `winner-name-formatter.ts`

Privacy: first name + last initial. Don't render full names anywhere public. Admin-only views can show full names.

### R9. Winner data has no PII beyond first-name + last-initial in public APIs

`/api/winners/` returns formatted-only data. Internal queries can use raw `Winner` documents.

## Performance

### R10. Use `maxTimeMS` on draw-transition queries

`updateMany` against the `MajorDraw` collection uses `maxTimeMS: 5000` to prevent runaway queries. Carry this over to any new long-running aggregation against draw collections.

### R11. Don't ping Mongo on every transition call

The connection-health check is `mongoose.connection.readyState === 1` (cheap). The expensive `db.admin().ping()` is throttled to once per 30 seconds. Don't add unconditional pings.
