# Infrastructure — Models

_N/A — this domain doesn't own collections. Migrations under `scripts/migrations/` operate on collections owned by other domains._

## Ad-platform scoping migrations (2026-07-29)

Two paired migrations add a `platform` discriminator so Meta and TikTok ad data can coexist.
Both are idempotent, dry-run by default, and abort before touching indexes if anything is
inconsistent. **Run order matters: stamp before the code that filters on it ships**, and both
must run in an environment before any TikTok sync writes there.

| Script | Collection | What it does |
| --- | --- | --- |
| [`2026-07-29-platform-scope-ad-destinations.ts`](../../scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts) | `metaaddestinations` | stamps `platform:"meta"`, drops the globally-unique `adId_1`, creates unique `{platform, adId}` |
| [`2026-07-29-platform-scope-landing-page-metrics.ts`](../../scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts) | `landingpagemetricsdailies` | stamps `platform:"meta"`, swaps the unique index to `{platform, adAccountId, date, canonicalUrl}` |
| [`2026-08-13-backfill-users-view-detail.ts`](../../scripts/migrations/2026-08-13-backfill-users-view-detail.ts) | `roles` | grants `users.viewDetail` to every role already holding `users.view` (`npm run migrate:backfill-users-view-detail[:dry]`) |

**`2026-08-13-backfill-users-view-detail` must run in every environment that has roles, including
production, and ideally before or with the deploy.** `users.viewDetail` was carved OUT of
`users.view` to gate the customer detail modal, and a new catalog action is deliberately NOT
auto-granted to existing custom roles — so until this runs, every staff role loses the modal it
could already open. Deliberately a **one-shot**, not part of the re-runnable
`migrate:seed-staff-roles`: after an operator removes `users.viewDetail` from a role, that role
still holds `users.view`, so a re-seed would match it again and silently re-grant what they just
revoked. Dry-run by default.


```bash
npx tsx scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts          # dry-run
npx tsx scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts --live
npx tsx scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts
npx tsx scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts --live
```

The second one is the dangerous one to skip: `SpendByUrlAggregationService.recomputeForDateRange`
deletes by `{platform, adAccountId, date}`, and `landingpagemetricsdailies` has **no TTL**. Rows
left unstamped are invisible to the scoped delete but still counted by the unique index, so the
rebuild collides instead of replacing. Applied to the dev DB 2026-07-29 (3,078 + 834 docs).
