# Metrics-Analytics — Testing

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
