# Admin — Testing

## Unit tests

| npm script | file | covers |
|---|---|---|
| `npm run test:past-due-admin-charge` | `src/server/admin/__tests__/chargePastDueShared.test.ts` | shared charge-past-due utilities |
| `npm run test:past-due-history` | `src/server/admin/__tests__/charge-past-due-totals.test.ts` | `aggregateRunTotals`, `isOrphanRun`, `ORPHAN_RUN_THRESHOLD_MS` |
| `npm run test:recover-stranded-past-due-policy` | `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` | pure helpers for stranded invoice recovery: idempotency keys, eligibility, draft-picking, 24h lock |
| `npm run test:force-charge-policy` | `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` | pure helpers for force-charge past-due flow: idempotency key, target picker, period-paid guard, 24h success lock |
| `npm run test:charge-or-recover-policy` | `src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts` | Pure decision function — open-but-dead invoices route to recover; live opens route to pay. |
| `npm run test:receipts` | `src/services/admin/__tests__/receipts.test.ts` | Receipts ledger pure logic: `classifyReceiptCategory` (every packageType, the `subscription_cycle` renewal case, the `additional-` split, missing-`packageId` parity with the Mongo `$not` clause); a **lockstep assertion against `classifyAcquisitionCategory`** proving renewals are the ONLY divergence — the thing that makes "Receipts − dashboard == renewals" true; `stripeDashboardUrl` for `pi_` / `invoice_in_` / `cus_` in **both** live and test mode, plus its refusal to guess an unknown prefix and its fail-safe-to-test mode resolution; `deriveReceiptRefund` (none / full / partial, cents→dollars conversion, over-refund clamp, no-payment-id); and CSV shape + quote escaping. |
| `npm run test:cancellation-analytics` | `src/services/admin/__tests__/cancellationFlowAnalytics.test.ts` | `summarizeCancellationEvents` pure shaper: reason shares, funnel (incl. abandoned = in_progress + >1h), save rate, offers-accepted, past-due exclusion, 90-day retention split (matured vs pending), **per-offer retention split `retention90ByOffer` (Task 21 — same matured/pending cutoff, per-offer totals reconcile with overall, empty-array zeroed guard)**, divide-by-zero guards (empty array, 0-denom save rate) |

`charge-past-due-totals.ts`, `recoverStrandedPastDuePolicy.ts`, `forceChargePastDuePolicy.ts`, `chargeOrRecoverPolicy.ts`, and `cancellationFlowAnalytics.ts`'s `summarizeCancellationEvents` are Stripe-free and Mongoose-free — run with just `tsx`, no env vars needed. So is `test:receipts`: its subject (`src/utils/admin/receipts.ts` + `src/utils/billing/stripeDashboardUrl.ts`) is the deliberately pure half of the Receipts feature, split out so the client can import it without bundling Mongoose — which also makes it unit-testable without a database.

## Receipts reconciliation (live data)

`npm run verify:receipts-reconciliation[:prod]` (`scripts/verify-receipts-reconciliation.ts`) is the Receipts ledger's real acceptance test and is **read-only** — safe against production. It proves Receipts net == `aggregateNetRevenueSum` exactly, that the gap to `buildByCategory`'s acquisition total is exactly the renewals total, and that all five shared categories agree to the cent. Exit 0 = reconciled, 1 = a mismatch (a classifier or query bug), 2 = the run itself failed. Unlike the unit tests it needs a live connection (`.env.local`, or `.env.production` via `:prod`). Latest figures: [receipts.md § Reconciliation](./receipts.md#reconciliation--the-real-acceptance-test).

## Dashboard stats snapshot tests

| npm script | file | covers |
|---|---|---|
| `npm run test:dashboard-stats-aggregator` | `src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts` | revenue aggregation logic |
| `npm run test:dashboard-stats-dst` | `src/services/admin/dashboard-stats/__tests__/dstBoundary.test.ts` | `aestDayBounds` and `expandDateKeyRange` across Sydney DST transitions (April fallback = 25h day, October spring-forward = 23h day) |
| `npm run test:dashboard-stats-schema` | `src/services/admin/dashboard-stats/__tests__/snapshotSchema.test.ts` | snapshot Zod schema validation |
| `npm run test:dashboard-stats-reader` | `src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts` | `readStatsForRange`: seeds three snapshot rows, reads range, asserts revenue summation, user counts, ad-channel ROAS recompute, and `meta.snapshotDaysUsed` (10/10 pass) |
| `npm run test:tiktok-sync-contract` | `src/services/admin/tiktok/__tests__/tiktokSyncContract.test.ts` | **Failure-visibility contract for the TikTok sync (panel F-008).** Stubs `globalThis.fetch` (zero-DB, zero-network): unconfigured → clean `{configured:false}` no-op with no API call; configured + `code 40001` → **throws `TikTokReportError`** carrying TikTok's code/message (so the cron 500s and Vercel cron monitoring stays red — a green cron over a dead token is the June-2026 Meta-spend-wipe failure class); configured + network error → also throws; configured + `code 0` with zero rows → clean success (empty ≠ failure). Also pins `metricNamesSuspect` (panel F-005) — fires only on clicks-with-zero-conversions-and-zero-revenue. |

The first three are pure (no Mongo, no env vars) — run with just `tsx`, as is `test:tiktok-sync-contract` (it stubs `fetch` and never reaches a write). `test:dashboard-stats-reader` requires a live MongoDB connection (`.env.local`).

## CLI diagnostic and test scripts

| npm script | file | covers |
|---|---|---|
| `npm run find:stuck-paused-users` | `scripts/find-stuck-paused-users.ts` | CSV export of `past_due` users whose current Stripe sub has no chargeable invoice; accepts `--limit=N` and `--include-orphans` |
| `npm run ops:force-charge:dry` | `scripts/test-force-charge.ts` | dry-run force-charge against a single user; accepts `--email=<addr>` or `--customer=<cus_id>` |
| `npm run ops:force-charge:live` | `scripts/test-force-charge.ts --live` | live force-charge execution; requires `--email=` or `--customer=` plus `--admin-email=<admin's email>` |
| `npm run ops:recover-stranded:dry` | `scripts/test-recover-stranded-past-due.ts` | Resolves a user by email/customer, scans open invoices for a stranded candidate, prints eligibility. No writes. |
| `npm run ops:recover-stranded:live` | `scripts/test-recover-stranded-past-due.ts --live` | Runs the full void → finalize draft → pay flow against a real user. Requires `--admin-email=`. Bypasses the 6h recovery lock so devs can re-run quickly during testing. |

Both scripts load `.env.local` via dotenv and exit with an error if `MONGODB_URI` or `STRIPE_SECRET_KEY` are missing.

## Manual smoke

- Log in as admin → access `/admin`
- Log in as non-admin → redirected by middleware
- Hit `/api/admin/*` as non-admin → 401/403 from handler
- Cancel via admin UserDetailModal → verify Stripe + DB + Klaviyo + partner queue all updated
- Bulk past-due charge → verify confirmation gate, audit rows, results display

## Anti-checks

- Try to bypass middleware on `/admin/foo` → must redirect
- Try to call `/api/admin/users/foo` without admin role → must 401/403
- Invalid confirmation on charge-past-due → must 400

## `npm run verify:tiktok-readpath` (2026-07-29)

[`scripts/verify-tiktok-readpath.ts`](../../scripts/verify-tiktok-readpath.ts) — read-only end-to-end check that the TikTok **read** paths still agree with what the sync **wrote**. Drives the real services (no re-implementation), so any writer↔reader drift surfaces:

1. `getTikTokAdInsights()` — totals vs the raw `TikTokAdInsightsDaily` sums, per-ad rows summing to totals, `roas = value ÷ spend`, ad count, sort order.
2. `tiktokAdChannelProvider.fetchForDay()` — the last three days' spend/value/ROAS against per-day sums, plus a future day returning `"empty"` (never a fabricated zero).

Run it after any change to the metric mapping, the aggregation, or the provider — and once after each real sync. Needs `TIKTOK_ADVERTISER_ID` + a valid `TIKTOK_MARKETING_ACCESS_TOKEN` and reads the DB in `.env.local`. Exits non-zero on any mismatch. First run (2026-07-29, 86 rows / 31 ads): all checks passed.

## `npm run verify:ad-platforms` (2026-07-29)

[`scripts/verify-local-ad-platforms.ts`](../../scripts/verify-local-ad-platforms.ts) — answers "can I test ad analytics on localhost?" by driving the **real** `DashboardStatsService.getStats()` (the same call the admin route makes) and printing, per platform: credentials present, ad-channel spend that reached the snapshot layer, the Advertising-card row (spend · signups · conversions · revenue · both ROAS figures), and the combined `adTotals` behind the headline KPIs. Exits non-zero if either Meta or TikTok fails to surface spend, and tells you which side is at fault (missing creds vs missing rows vs expired token).

Both platforms work locally as long as `.env.local` carries `FACEBOOK_AD_ACCOUNT_ID` + `FACEBOOK_MARKETING_ACCESS_TOKEN` and `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN`. **Meta is fetched live from its API per day in range; TikTok is read from `TikTokAdInsightsDaily`**, so TikTok needs a sync first — `npm run seed:tiktok-insights -- --days=30` against whichever DB `.env.local`'s `MONGODB_URI` points at. (There is no live-fetch fallback for TikTok by design: the per-ad sync is the source of truth and re-fetching it on every dashboard render would be slow and rate-limited.)
