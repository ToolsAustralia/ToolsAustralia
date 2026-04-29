# Metrics-Analytics — Testing

> _TODO: enumerate any tests under `services/metrics/__tests__/` or `services/analytics/__tests__/`._

## Manual smoke

- Run daily aggregation cron manually
- Verify `LandingPageMetricsDaily` rows update
- Check dashboard reflects new data
- Insert backfill row → verify confidence-filter excludes it from primary metrics
