# Email — Architecture

## Provider split

Per CLAUDE.md:
- **SendGrid** — transactional email (signup confirmation, password reset, payment receipts)
- **Klaviyo** — marketing email (campaigns, drip, comeback flows) — owned by [tracking](../tracking/)

## Files

| File | Role |
|---|---|
| [src/lib/email/](../../src/lib/email/) | Email service helpers, template rendering |
| [src/lib/email.ts](../../src/lib/email.ts) | Email entry point |
| [src/lib/sms.ts](../../src/lib/sms.ts) | SMS provider integration |
| `*-email-template.html` (repo root) | HTML templates — kept in lockstep with `src/lib/email/` |

## Templates at repo root

Per CLAUDE.md "Subsystems with their own conventions": HTML templates live at the repo root (e.g. `welcome-email-template.html`, `payment-receipt-template.html`). Edit these alongside any code changes that reference them.

## Preview app

`src/app/email-preview/` + [src/components/email-preview/](../../src/components/email-preview/) — local preview of rendered emails for QA before sending.

## Send paths

```
[trigger event] → email service → render template → SendGrid send
                                                          │
                                                          ▼
                                                  No DB record kept
                                                  (SendGrid is system of record for delivery)
```

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
