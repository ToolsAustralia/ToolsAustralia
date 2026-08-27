# Draws — Models

6 collections own this domain.

## `MajorDraw`

[src/models/MajorDraw.ts](../../src/models/MajorDraw.ts) — monthly draw cycle (28th–27th).

Status: `queued | active | frozen | completed`. Transitions managed exclusively by [`major-draw-transition-service.ts`](../../src/utils/draws/major-draw-transition-service.ts) — see [rules R1](./rules.md#r1-the-transition-service-is-the-only-authority).

Key dates:
- `activationDate` — when `queued → active` (publicly visible, accepting entries)
- `freezeEntriesAt` — when `active → frozen` (no new entries, draw approaching)
- `drawDate` — when `frozen → completed` (winner declared)

> _TODO: pull full schema (fields, indexes) from the source file._

## `MiniDraw`

[src/models/MiniDraw.ts](../../src/models/MiniDraw.ts) — per-product giveaway tied to a specific package or product purchase.

Has its own activation/draw lifecycle, separate from the monthly major cadence.

> _TODO: pull full schema._

## `TicketEntry`

[src/models/TicketEntry.ts](../../src/models/TicketEntry.ts) — individual entries into a draw (major or mini).

> _TODO: schema, indexes, idempotency strategy._

## `Winner`

[src/models/Winner.ts](../../src/models/Winner.ts) — declared winners.

Public-facing reads MUST go through `winner-name-formatter.ts` for PII redaction (first-name + last-initial only).

> _TODO: schema._

## `MonthlyEntryCampaign`

[src/models/MonthlyEntryCampaign.ts](../../src/models/MonthlyEntryCampaign.ts) — tracks monthly entry campaigns (segments, multipliers, rules per cycle).

- `neverExpires: boolean` (default `false`) — when true, issuances never expire. `endsAt` is conditionally required via the schema-level `required` function (`!neverExpires`); the `pre("save")` hook re-checks the same condition, but only to throw a friendlier duplicate error — it is not the primary enforcement.
- `validForHours?: number` (min 1) — per-customer expiry window in hours. When set, each `RedeemableIssuance` expires `validForHours` hours after the instant it was issued (the marketing flow's webhook call), not at the campaign's `endsAt`. Unset ⇒ legacy behaviour (issuance expiry copies the campaign's `endsAt`). See [`isCampaignRedeemable`/`personalWindowGoverns` in bonus-code-policy.ts](../../src/utils/redeemables/bonus-code-policy.ts) — once a campaign hands out personal windows, its own `endsAt` becomes a *minting* backstop rather than a redemption deadline.
  - **Renamed from `validForDays` (2026-08-26, bonus-code-webhook-rework)** — the Klaviyo webhook model anchors a code's expiry on the instant the webhook fires, not the customer's original eligibility moment, so the window is now a fixed hour count (default 72) rather than a whole-calendar-day count. The rename is **complete**: the model, `bonus-code-policy.ts`, `CampaignService.ts`, and every other consult site (both admin API routes, the cron route, `RedemptionService`, `RedeemablesWalletService`, `CampaignCodeValidationService`, `MonthlyCouponQueryService`, the Norm schema + route, and the two admin UI components) all read and write `validForHours`. See [docs/rewards-redeemables/architecture.md](../rewards-redeemables/architecture.md#per-customer-anchored-expiry-bonus-entry-codes).
  - **Mutually exclusive with `neverExpires`.** The `pre("save")` guard only covers the create path — `updateCampaign` calls `findByIdAndUpdate(..., { runValidators: true })`, which runs schema validators but does **not** run `pre("save")` hooks, so an update could still set both. The authoritative gate for updates is `CampaignService.updateCampaign`'s own merged-state guard: it fetches the existing document, merges it with the incoming partial update, and rejects a MERGED `neverExpires`/`validForHours` pair that is truthy on both sides — a `PUT { neverExpires: true }` that omits `validForHours` can no longer silently leave a stale rolling window in force. The Zod refine at the route boundary is only a cheap early gate (it sees a single payload, not the merged state). **Untyped-string footgun:** the guard's own `.select("neverExpires validForHours")` and its `$unset`/`delete` clearing keys are plain Mongo field-name strings that `tsc` cannot check. If any of them drifts from the field name, the guard silently reads `existing?.validForHours` as `undefined` (so it only ever sees the current payload) and `PUT { validForHours: null }` persists an explicit `null` instead of truly unsetting the field. Keep all three in lockstep with the field.
- Has a dev/hot-reload staleness probe that clears the cached mongoose model when `code`, `neverExpires`, `purchaseRequirement`, or `validForHours` is missing from the live schema, or when `endsAt` is statically (unconditionally) required — mongoose `strict` mode drops undeclared paths silently, so without this probe a stale cached model in dev makes a newly-added field look like it simply refuses to persist.
- `RedeemableIssuance` rows (one per `(campaignId, userId)`) are documented in [docs/rewards-redeemables/models.md](../rewards-redeemables/models.md).

> _TODO: full field list, relationship to MajorDraw, who writes it._

## `SegmentSnapshot`

[src/models/SegmentSnapshot.ts](../../src/models/SegmentSnapshot.ts) — point-in-time membership-tier distribution snapshots, used for retro analytics on who was in which segment when a draw was decided.

> _TODO: schema, snapshotting cadence._

## `User.miniDrawParticipation` (subdoc)

Denormalized for fast UI reads. Kept in sync by mini-draw entry-purchase webhook and refund reversers. See [User.ts:108-119](../../src/models/User.ts#L108-L119).

```ts
miniDrawParticipation?: Array<{
  miniDrawId: ObjectId;
  totalEntries: number;
  entriesBySource: { "mini-draw-package"?: number; "free-entry"?: number };
  firstParticipatedDate: Date;
  lastParticipatedDate: Date;
  isActive: boolean;
}>;
```
