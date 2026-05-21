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

> _TODO: schema, relationship to MajorDraw, who writes it._

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
