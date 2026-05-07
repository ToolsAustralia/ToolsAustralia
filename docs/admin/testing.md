# Admin — Testing

## Unit tests

| npm script | file | covers |
|---|---|---|
| `npm run test:past-due-admin-charge` | `src/server/admin/__tests__/chargePastDueShared.test.ts` | shared charge-past-due utilities |
| `npm run test:past-due-history` | `src/server/admin/__tests__/charge-past-due-totals.test.ts` | `aggregateRunTotals`, `isOrphanRun`, `ORPHAN_RUN_THRESHOLD_MS` |
| `npm run test:recover-stranded-past-due-policy` | `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` | pure helpers for stranded invoice recovery: idempotency keys, eligibility, draft-picking, 24h lock |
| `npm run test:force-charge-policy` | `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` | pure helpers for force-charge past-due flow: idempotency key, target picker, period-paid guard, 24h success lock |

`charge-past-due-totals.ts`, `recoverStrandedPastDuePolicy.ts`, and `forceChargePastDuePolicy.ts` are Stripe-free and Mongoose-free — run with just `tsx`, no env vars needed.

## CLI diagnostic and test scripts

| npm script | file | covers |
|---|---|---|
| `npm run find:stuck-paused-users` | `scripts/find-stuck-paused-users.ts` | CSV export of `past_due` users whose current Stripe sub has no chargeable invoice; accepts `--limit=N` and `--include-orphans` |
| `npm run test:force-charge:dry` | `scripts/test-force-charge.ts` | dry-run force-charge against a single user; accepts `--email=<addr>` or `--customer=<cus_id>` |
| `npm run test:force-charge:live` | `scripts/test-force-charge.ts --live` | live force-charge execution; requires `--email=` or `--customer=` plus `--admin-email=<admin's email>` |

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
