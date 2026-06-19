# Email — Architecture

## Provider split

Per CLAUDE.md:
- **SendGrid** — transactional email (verification, password reset, login code, staff invite, contact/partner notifications, admin replies, **major-draw winner**, **referral reward**), sent from code via `EmailService`.
- **Klaviyo** — marketing / lifecycle email (invoice receipt, renewal success/failed, signup payment failed, future draw reminder). The code only **tracks events**; the email/flow lives in the Klaviyo UI. The hardened HTML is pasted into Klaviyo manually.

## 2026 design system

All transactional templates share one visual family (dark industrial navy header + red bar + hazard stripe, white card, hazard footer) — the Claude Design handoff implemented June 2026.

- **Shared SendGrid builders:** [src/lib/email/components.ts](../../src/lib/email/components.ts) — `renderBrandEmail()` (head/header/footer wrapper) + content helpers (`button`, `codeBox`, `entriesCallout`, `prizePanel`, `alertBlock`, `infoTable`, `chip`, `heading`, `lede`, `note`, `divider`, `spacer`). All email-client-safe: table layout, inline styles, bulletproof VML buttons, mso fallback, hidden preheader, light + dark mode.
- **Inline-CSS style fragments** for the older transactional templates remain in [src/lib/email/template-styles.ts](../../src/lib/email/template-styles.ts).
- **Cross-client rules reference:** [cross-client-rendering.md](./cross-client-rendering.md) — read before authoring/hardening any template.

## Files

| File | Role |
|---|---|
| [src/lib/email/email-service.ts](../../src/lib/email/email-service.ts) | `EmailService` — the only live SendGrid sender; one method per email type, each resolving its own sender identity. |
| [src/lib/email/templates.ts](../../src/lib/email/templates.ts) | `create*EmailTemplate()` functions (server-rendered HTML strings). |
| [src/lib/email/components.ts](../../src/lib/email/components.ts) | Shared 2026 design-system builders (above). |
| [src/lib/email/staff-invite.ts](../../src/lib/email/staff-invite.ts) | Builds the staff-invite HTML via `createStaffInviteEmailTemplate()` (code-as-source) and sends it. |
| [src/lib/email/utils.ts](../../src/lib/email/utils.ts) | Rate limiting (incl. form-submission limit **3 per 5 min** per `email_IP`), code generation, HTML escaping. |
| [src/lib/email.ts](../../src/lib/email.ts) | **Deprecated** — transporter returns `null`; do not use. The live module is the `src/lib/email/` directory. Import via `@/lib/email/` (trailing slash) so resolution hits the directory index, not this file. |
| [src/lib/sms.ts](../../src/lib/sms.ts) | SMS provider integration. |

## Klaviyo paste-ready HTML templates

`email-templates/klaviyo/` = paste-ready Klaviyo custom-HTML; `email-templates/klaviyo-exports/` = read-only Klaviyo export snapshots (reference). There are **no SendGrid HTML files** — every SendGrid email is code-as-source (`templates.ts` + `components.ts`).

| File | Folder | Delivery | Merge syntax |
|---|---|---|---|
| `invoice-email-template.html` | `klaviyo/` | **Klaviyo** (pasted) — `Invoice Generated` event | Django `{{ event.* }}` / `{% for %}` / `{% unsubscribe %}` |
| `subscription-renewal-email-template.html` | `klaviyo/` | **Klaviyo** — `Subscription Renewed` | Django |
| `renewal-failed-email-template.html` | `klaviyo/` | **Klaviyo** — `Subscription Renewal Failed` | Django |
| `subscription-payment-failed-email-template.html` | `klaviyo/` | **Klaviyo** — `Subscription Payment Failed` (signup) | Django |
| `draw-reminder-email-template.html` | `klaviyo/` | **NOT WIRED** — prepared for future use (no event/cron triggers it yet) | Django |

## Wired SendGrid emails of note (2026)

- **Winner** (`emailService.sendWinnerEmail`) — sent to the winning member only, on first winner selection from both `POST /api/major-draw/select-winner` and `POST /api/admin/major-draw/select-winner` (the admin "record gov-app winner" path). Not re-sent when an existing winner is updated. See [draws/backend.md](../draws/backend.md) and [admin/backend.md](../admin/backend.md).
- **Referral reward** (`emailService.sendReferralRewardEmail`) — sent to **both** the referrer and the referred friend when a referral converts, from `completeReferralConversion` in [src/lib/referral.ts](../../src/lib/referral.ts). See [referrals/backend.md](../referrals/backend.md).
- Both are best-effort (try/catch, never block the underlying action).

## Verification code in subject

`sendVerificationEmail` puts the 6-char code in the **subject line** (`"<CODE> is your Tools Australia verification code"`) so users can read it without opening the email. The body shows it in a `codeBox` (it is a **code**, not a magic link). `sendLoginCodeEmail` does the same with the sign-in code.

## Coverage + social icons (2026 refresh)

Every transactional template now renders from the shared `components.ts` design system: verification, login code, password reset, staff invite, **contact notify**, **partner notify**, **admin reply**, **mini-draw 100%**, winner, referral. The Klaviyo/disk templates duplicate the same header/footer markup.

**Social icons** in the footer are self-hosted `<img>` icons (clickable, dark circular badge fallback) pointing at:
`https://toolsaustralia.com.au/images/social/{facebook,instagram,tiktok}.png` — these 3 PNG files must exist in `public/images/social/` (white-glyph, transparent, ~40×40 for retina) or only the dark circle + alt text shows. URLs: Facebook `https://www.facebook.com/toolsaust` (the active page — note it is `toolsaust`, not `toolsaustralia`), Instagram `https://instagram.com/toolsaustralia`, TikTok `https://www.tiktok.com/@toolsaustralia`. The footer shows the brand name, support email, social icons, unsubscribe (marketing/Klaviyo only) and the draw-verification line — **no postal address** (removed per owner).

## Klaviyo merge-field verification (do this before pasting a Klaviyo template)

Every `{{ event.X }}` / `{{ person.X }}` in a Klaviyo template MUST match a real property of the **flow's trigger metric** (event props) or the **profile** (person props), or it renders blank in the sent email. Verify against the live account (Klaviyo MCP `get_events` + `get_profiles`, or the flow's trigger metric) — do not assume. Confirmed mapping (verified June 2026):

| Template file | Klaviyo flow | Trigger metric | Key fields |
|---|---|---|---|
| `invoice-email-template.html` | Invoice | Invoice Generated | `event.invoice_number/invoice_date/total_amount/entries_gained`, `event.items[].description/unit_price/quantity` (partner-discount block removed June 2026) |
| `subscription-renewal-email-template.html` | Membership Renewal | Subscription Renewed | `event.package_name/renewal_date/price/payment_intent_id/entries_granted`, `person.current_draw_name` |
| `renewal-failed-email-template.html` | Failed Membership Renewal | Subscription Renewal Failed | `event.failure_reason/amount/package_name/failure_message/failure_code/payment_intent_id/entries/entries_formatted` |
| `subscription-payment-failed-email-template.html` | Failed Membership Purchase | Subscription Payment Failed | uses **`event.price`** — this metric has **no `amount`** field — plus `event.failure_reason/failure_code/failure_message/package_name/payment_intent_id` |

`person.*` are profile (not event) properties: `first_name`, `current_draw_name`, `current_draw_entries`, etc. The unwired `draw-reminder` uses `person.current_draw_entries` (NOT `current_entries`).

## Preview app

`src/app/email-preview/` + [src/components/email-preview/](../../src/components/email-preview/) — dev-only (`/email-preview`, 404 in prod). SendGrid tabs render live from `templates.ts`; Klaviyo/disk tabs embed the rendered design with sample data.

## Send paths

```
[trigger event] → EmailService.sendX → render template (templates.ts/components.ts) → SendGrid send
                                                          │
                                                          ▼
                                                  No DB record kept
                                                  (SendGrid is system of record for delivery)
```

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
