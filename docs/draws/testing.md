# Draws — Testing

## Manual scenario scripts

Under [scripts/](../../scripts/):

| Script | Scenario |
|---|---|
| `scripts/test-1-draw-ending-60mins.ts` | Draw with 60 min remaining |
| `scripts/test-2-draw-ending-30mins.ts` | Draw with 30 min remaining |
| `scripts/test-3-draw-just-ended.ts` | Draw just transitioned to completed |
| `scripts/test-4-next-draw-active.ts` | Next draw activated after current completed |

Run via `npx tsx scripts/test-1-draw-ending-60mins.ts` etc. They mutate the local DB to set up a specific timing scenario, then you can manually verify UI behaviour, transitions, and webhook handling.

> _TODO: document what each script writes to the DB and how to revert._

## Helper unit tests

> _TODO: enumerate `src/utils/draws/__tests__/` test files (if any) and matching `npm run test:*` scripts._

## What's NOT well-tested

- The transition service end-to-end (covered by integration testing in production).
- Winner-declaration logic (manual scripts only).
- Multi-instance debounce behaviour (per-instance only, by design).

## DST regression

The major-draw transition timing intersects with DST transitions in Sydney. The DST script under [scripts/test-dst-transitions.ts](../../scripts/test-dst-transitions.ts) covers anchor billing — see if it also exercises draw timing, otherwise add cases.

> _TODO: confirm overlap and add draw-specific DST cases if needed._
