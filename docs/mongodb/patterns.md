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
