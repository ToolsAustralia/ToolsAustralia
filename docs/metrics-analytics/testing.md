# Metrics-Analytics — Testing

## `npm run verify:tiktok-accuracy` — cross-source accuracy pass

[scripts/verify-tiktok-accuracy.ts](../../scripts/verify-tiktok-accuracy.ts). Read-only.
Compares four sources that are each derived independently, so agreement is evidence rather
than tautology:

| | source | catches |
| --- | --- | --- |
| A | TikTok's live `/report/integrated/get/` | — |
| B | `TikTokAdInsightsDaily` | A→B: a broken sync |
| C | `LandingPageMetricsDaily` | B→C: a broken aggregation |
| D | `PackagesFocusBreakdownService` | C→D: a broken read path |

It also asserts the platform scoping holds (no unstamped rows in either shared collection, no
cross-namespaced `unknown://` placeholders) and that **Meta's** rollup still reconciles with
Meta's insights — the regression platform-scoping the shared collections could plausibly cause.

**The current AEST day is excluded from A→B deliberately.** B is a snapshot from the last sync;
A is live, and today's spend accrues between them. Comparing strictly would fail every run for a
non-reason, and an alarm that always fires teaches people to ignore it. Today is still *reported*
as drift alongside the last-sync time, so genuine staleness stays visible — it just isn't a
failure. Meta gets a 50c tolerance because Meta restates spend after the fact.

```bash
npm run verify:tiktok-accuracy
npm run verify:tiktok-accuracy -- --since=2026-06-01 --until=2026-06-30
```

Exit 0 = all passed, 1 = a check failed or creds/DB unavailable. Last run 2026-07-29 on the dev
account: 13/13 passed; today's drift $7.40 over the hour since the sync, every closed day exact
to the cent.


## Automated tsx tests

| Script | Source | Covers |
|---|---|---|
| `npm run test:age-grouping` | `src/utils/metrics/__tests__/age-grouping.test.ts` | `getAgeGroup` calendar-age math, `Unknown` for null/future/<18/`NaN`-time, `AGE_GROUP_ORDER` invariants. |
| `npm run test:profession-normalize` | `src/utils/metrics/__tests__/profession-normalize.test.ts` | Synonym map, canonical case-insensitive match, plural-strip retry, title-case fallback, `bucketUnmatched` top-N + `"Other (custom)"` rollup, dropdown `"Other"` vs `"Other (custom)"` distinction. |

> _TODO: enumerate any tests under `services/metrics/__tests__/` or `services/analytics/__tests__/`._

## Manual smoke

- Run daily aggregation cron manually
- Verify `LandingPageMetricsDaily` rows update
- Check dashboard reflects new data
- Insert backfill row → verify confidence-filter excludes it from primary metrics
