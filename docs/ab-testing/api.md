# A/B Testing — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/ab-testing/**` | Assignment, conversion tracking, dashboard data |

> _TODO: read [src/app/api/ab-testing/](../../src/app/api/ab-testing/) handlers._

### GET /api/ab-testing/membership-theme-experiment

Read-only discovery for the site-wide membership dark-mode experiment.
Returns `{ experimentId: string | null }` (the active experiment whose
`slugTargets` includes the sentinel `__membership-theme__`). No DB writes;
assignment/tracking is delegated to `POST /api/ab-testing/assign`.
