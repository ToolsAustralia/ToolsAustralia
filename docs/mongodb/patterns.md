# MongoDB — Patterns

## P1. Singleton connection

Standard Next.js pattern: cache the connection promise on `global` so hot-reload doesn't open new connections.

```ts
// lib/mongodb.ts (simplified)
const cached = (global as any).mongoose ?? { conn: null, promise: null };
if (!cached.promise) cached.promise = mongoose.connect(uri);
cached.conn = await cached.promise;
(global as any).mongoose = cached;
```

## P2. One Mongoose model per file

Per CLAUDE.md layering: `src/models/<Name>.ts` exports a single Mongoose model. Don't bundle multiple models per file.

## P3. Repository for cross-collection queries

When a query involves multiple collections or aggregations, abstract into a repository. Service code stays focused on business logic; repositories own the SQL-equivalent concerns.

## P4. Distributed lock via single-document collection

`ChargeJobLock` pattern: a collection with one doc. `findOneAndUpdate({ _id, isLocked: false }, { ..., isLocked: true })` atomically acquires.

## P5. Idempotent writes via upsert

For event-sourced collections (`PaymentEvent`, `ProcessedStripeEvent`, `MembershipStatusHistory`), use deterministic keys + `upsert: true` so retries don't double-insert.

## P6. Dry-run flag on scripts

Operational scripts default to dry-run. `--live` flag required to commit. Don't commit live-by-default scripts.

## P7. Never load an unbounded embedded array to read one element or its length

When a document holds a growing embedded array (e.g. `MajorDraw.entries[]` — one subdoc per participating user), a `findById()`/`findOne()` with no projection transfers the **entire array** over the wire and (without `.lean()`) hydrates every element into a Mongoose subdocument — multi-MB of egress + CPU per call on a hot read path, getting worse as the array grows. Project instead of scanning in JS:

- **Read one element, querying by something else** (e.g. `findById`) → `$elemMatch` projection + `.lean()`, so Mongo returns just the matching subdoc:
  ```ts
  const doc = await Model.findById(id, { items: { $elemMatch: { userId: oid } } }).lean<...>();
  const item = doc?.items?.[0]; // undefined when no match (the field is omitted)
  ```
  Back it with an index on the array field (`{ "items.userId": 1 }`).
- **Read one element, when the query already filters on the array** (e.g. `find({ "items.userId": oid })` across many docs) → positional `$` projection, which returns each matched doc's matched element:
  ```ts
  const docs = await Model.find({ "items.userId": oid }, { "items.$": 1, name: 1 }).lean<...>();
  // each docs[i].items[0] is that doc's matched element — N small subdocs, not N full arrays
  ```
- **Read the length only** → server-side `$size` via aggregation, so only an integer crosses the wire:
  ```ts
  const [{ count = 0 } = {}] = await Model.aggregate([
    { $match: { _id: oid } },
    { $project: { count: { $size: { $ifNull: ["$items", []] } } } },
  ]);
  ```
- **Don't need the array at all** (display/metadata reads) → exclude it: `.select("-items")`.

Reference implementation: `getUserMajorDrawStats` / `getMajorDrawParticipantCount` ([`major-draw-queries.ts`](../../src/utils/database/queries/major-draw-queries.ts)) and `getCurrentMajorDrawForDisplay` ([`major-draw-helpers.ts`](../../src/utils/draws/major-draw-helpers.ts)). See `docs/draws/gotchas.md` → "Read-path amplification". The durable end-state for very large arrays is a separate collection keyed `{ parentId, userId }` rather than an embedded array.
