# A/B Testing — Patterns

## P1. Server-resolved variant on first request

The first server-rendered HTML contains the right variant. No client-side variant swap. Hydration is consistent.

## P2. Assignment idempotency via stable seed

`hash(experimentId + userId) % 100 < threshold` → variant. Pure function, deterministic, no DB lookup needed in the hot path. The `Assignment` row is written async for analytics; reads use the deterministic hash.

## P3. DB-optimized repositories

(Migrated from `docs/AB_TESTING_DATABASE_OPTIMIZATION.md` — _TODO: read root._)

Brief: tight indexes per (experimentId, userId, eventType, timestamp); projection-only queries for dashboards; no full-document scans on the conversion collection.

## P4. Dedupe via natural keys

(Migrated from `docs/AB_TESTING_DEDUPLICATION.md` — _TODO: read root._)

Brief: conversion events have `${userId}:${experimentId}:${eventType}` as a natural key. Dedupe at write time via `findOneAndUpdate(..., upsert)` so retries don't double-count.

## P5. Materialised metrics for fast dashboards

Aggregations are run asynchronously and stored, so admin dashboards don't compute on every page load. _TODO: confirm whether this is implemented or if dashboards compute live._
