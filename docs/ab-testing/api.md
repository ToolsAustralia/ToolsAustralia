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

### PATCH /api/admin/ab-testing/experiments/[id] — accepts stoppingRules

The admin update endpoint accepts `stoppingRules` in the body in addition to
`name / status / slugTargets / startDate / endDate`. Shape:

```
stoppingRules?: {
  minConversions?: number;       // >= 0
  confidenceThreshold?: number;  // 0..100
  maxDuration?: number;          // >= 1 (days)
  autoEndEnabled?: boolean;
}
```

`ExperimentService.updateExperiment` still blocks any edit (including stoppingRules)
when the experiment is `active` or `ended` — only `draft` / `paused` are editable.
The admin Edit Experiment modal (Pencil icon in the list row) uses this route.

## Seed scripts

- `npm run seed:variation-experiment[:dry]` — populates a `draft` Experiment named
  `"landing page variation 1 and variation 2"` with two 50/50 variants whose
  `hero.imageSrcBySlug` map 16 landing slugs (4 toolset + 12 prize-specific) to
  the matching webp under `/images/background/promo/landing/variation{1,2}-*/`.
  Idempotent: if an admin-created draft with the same name already exists, the
  script populates its variants in place (provided it has none yet).
