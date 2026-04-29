# Email — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/email/](../../src/lib/email/) | Email service: render template, build SendGrid payload, send |
| [src/lib/email.ts](../../src/lib/email.ts) | Top-level email facade |
| [src/lib/sms.ts](../../src/lib/sms.ts) | SMS provider integration |

## Template files

`*-email-template.html` at repo root. Examples:
- `welcome-email-template.html`
- `payment-receipt-template.html`
- _(others)_

> _TODO: enumerate full template inventory._

When a template is updated, ensure the rendering helper in `src/lib/email/` knows about any new variables. Otherwise template renders blanks.

## Newsletter integration

`/api/newsletter/` — likely a proxy to Klaviyo for opt-in lists. Klaviyo for marketing is documented in [tracking](../tracking/).

## SMS

`lib/sms.ts` — SMS for things like 2FA / password reset (if used). _TODO: confirm provider and use cases._
