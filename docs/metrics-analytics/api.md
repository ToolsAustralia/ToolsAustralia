# Metrics-Analytics — API

This domain doesn't own a dedicated `/api/metrics/` namespace per the manifest. Metric data is exposed via:

- Admin routes under `/api/admin/**` (in [admin](../admin/))
- User-specific reads via dashboard hooks (likely `/api/user/metrics/` or similar)

> _TODO: locate exact route paths for metric reads and document._
