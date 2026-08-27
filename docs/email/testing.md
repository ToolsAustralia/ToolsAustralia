# Email — Testing

## SendGrid testing

(Migrated from `docs/SENDGRID_TESTING_GUIDE.md` — _TODO: read root and merge._)

Brief: use the dedicated test email address; verify in SendGrid sandbox; don't send to real users from dev.

## Preview app

```bash
npm run dev
# visit http://localhost:3000/email-preview
```

Renders templates with sample data for visual QA.

## SMS

```bash
npm run test:sms                       # AU number normalisation + SMS_ENABLED opt-in (pure, no network)
npm run test:mobile-otp                # OTP policy — code, hashing, limiter (auth domain)
npm run smoke:sms-send -- 0412345678    # REAL send. Spends a credit.
```

[scripts/smoke-sms-send.ts](../../scripts/smoke-sms-send.ts) is the only proof delivery actually works
(and the measurement half of the provider bake-off — delivery *time* decides the provider, not
headline price). It refuses to run unless `SMS_ENABLED=true`, sends only to the one number passed on
argv, and never reads the user database. Flags: `--count`, `--gap` (keep ≥1s — the gateway caps
concurrency at 5 and 429s past it), `--message`, `--yes`.

## What's NOT well tested

- Cross-provider unsubscribe sync
- High-deliverability reputation handling
- Template rendering edge cases (missing variables, malformed input)
- SMS gateway failure modes — `blocked` / `error` results and suppression behaviour are handled in
  code but never exercised against the live API; only `smoke:sms-send` touches it, one number at a time.
