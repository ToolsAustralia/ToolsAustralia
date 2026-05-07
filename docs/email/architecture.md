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

## Shop transactional emails

Two new senders, both `TRANSACTIONAL` (`no-reply@toolsaustralia.com.au`, replyTo `support@`), fired as background jobs from [src/services/shop/finalizeShopOrder.service.ts](../../src/services/shop/finalizeShopOrder.service.ts):

| Method | Template fn | Root HTML | Trigger |
|---|---|---|---|
| `emailService.sendShopOrderConfirmation` | `createShopOrderConfirmationEmailTemplate` | [`shop-order-confirmation-email-template.html`](../../shop-order-confirmation-email-template.html) | Order written successfully — AU tax invoice with ABN, GST line, line items, shipping address. Order row's `invoiceSentAt` is set after success. |
| `emailService.sendShopStockRefund` | `createShopStockRefundEmailTemplate` | [`shop-stock-refund-email-template.html`](../../shop-stock-refund-email-template.html) | Stock ran out between PI confirm and finalize → refund issued, customer apologized. |

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
