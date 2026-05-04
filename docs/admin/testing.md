# Admin — Testing

> _TODO: enumerate any tests under `services/admin/__tests__/` or `server/admin/__tests__/`._

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
