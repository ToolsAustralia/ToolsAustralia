# Security & CSP — Testing

## Security regression checklist

(Migrated from `docs/security-regression-checklist.md` — _TODO: read root and merge._)

Brief: a checklist of things to verify on every release that could affect security (CSP integrity, auth gates, rate-limit thresholds, dependency CVEs).

## Manual smoke

- Open browser DevTools → Network → Headers; verify CSP header present and includes nonce
- Try an inline `<script>` injection without nonce → must be blocked
- Hit a rate-limited endpoint repeatedly → must 429
- Hit `/api/stripe/webhook` simulated POST → verify no COEP blocks
- Sign in as non-admin → try `/admin/*` → must redirect via middleware

## Distributed limiter `refund()` — no unit test, verify by hand

`refund()` needs Mongo, so nothing pins it automatically: `npm run test:mobile-otp` covers only
the pure half of the OTP policy (code generation, hashing, refusal copy) and explicitly skips the
claim path. To check it after touching `createDistributedRateLimiter`:

- Call `claimOtpSendAllowance("<id>")` twice in a row (scratch `tsx` script, `SMS_OTP_RATE_LIMIT_IN_DEV=true`
  so the dev bypass is off). The second call must be refused with `reason: "cooldown"`, and the
  `RateLimit` document `sms-otp-send-daily:<id>` must still read `count: 1` — it claimed a daily
  token and the cooldown rejection refunded it.
- Await the returned `release()` on an allowed claim. Both `sms-otp-send-daily:<id>` and
  `sms-otp-send-cooldown:<id>` must return to their pre-claim counts; a second `release()` must
  change nothing.
- Call `refund` more times than `check` — `count` must floor at 0, never go negative.
