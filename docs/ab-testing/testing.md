# A/B Testing — Testing

> _TODO: enumerate test files under `services/ab-testing/__tests__/` or similar._

## Manual smoke

- Visit a page with an active experiment → verify deterministic variant
- Refresh repeatedly → verify same variant (sticky)
- Convert → verify single conversion row written (dedupe)
- Visit dashboard → verify metrics update

## What's NOT well tested

- Statistical significance computation
- Bot filtering
- Materialized vs live metric divergence
