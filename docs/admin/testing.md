# Admin — Testing

## Unit tests

| npm script | file | covers |
|---|---|---|
| `npm run test:past-due-admin-charge` | `src/server/admin/__tests__/chargePastDueShared.test.ts` | shared charge-past-due utilities |
| `npm run test:past-due-history` | `src/server/admin/__tests__/charge-past-due-totals.test.ts` | `aggregateRunTotals`, `isOrphanRun`, `ORPHAN_RUN_THRESHOLD_MS` |

`charge-past-due-totals.ts` is Stripe-free and Mongoose-free — run with just `tsx`, no env vars needed.

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
