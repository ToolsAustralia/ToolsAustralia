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

## What's NOT well tested

- Cross-provider unsubscribe sync
- High-deliverability reputation handling
- Template rendering edge cases (missing variables, malformed input)
