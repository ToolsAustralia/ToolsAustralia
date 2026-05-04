# Error Reporting — Testing

> _TODO: enumerate any tests under `services/error-reporting/__tests__/` or `lib/errors/__tests__/`._

## Manual smoke

- Trigger a known error path → verify `ErrorReport` row written
- Visit `/admin/error-reports/` (admin) → verify visibility
- Mark resolved → verify state transition
