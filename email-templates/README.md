# Email templates

Klaviyo paste-ready HTML lives here. SendGrid emails are **code-as-source** (`src/lib/email/`), not files.

## SendGrid transactional — code-as-source (no HTML files here)

**Every** SendGrid transactional email (verification, password reset, login code, **staff invite**, winner, referral, contact/partner notify, admin reply, mini-draw) is **generated in [`src/lib/email/templates.ts`](../src/lib/email/templates.ts)** from the shared design system in [`src/lib/email/components.ts`](../src/lib/email/components.ts) — there are no SendGrid HTML files on disk. The dev preview at `/email-preview` renders them live.

> Staff invite used to be a disk-loaded `sendgrid/staff-invite-email-template.html`; it was migrated to code-as-source June 2026 and that folder removed.

## `klaviyo/` — Klaviyo paste-ready custom HTML

The hardened custom-HTML templates we copy/paste into Klaviyo **CODE** flow emails — one per flow:

| File | Klaviyo flow |
|---|---|
| `invoice-email-template.html` | Invoice |
| `subscription-renewal-email-template.html` | Membership Renewal |
| `renewal-failed-email-template.html` | Failed Membership Renewal |
| `subscription-payment-failed-email-template.html` | Failed Membership Purchase |

These use Klaviyo Django merge tags (`{{ event.* }}`, `{{ person.* }}`, `{% if %}`, `{% unsubscribe %}`). Merge tags must match the flow's trigger-metric event properties + profile properties — see [`klaviyo/INDEX.md`](klaviyo/INDEX.md) and `docs/email/architecture.md` ("Klaviyo merge-field verification"). Paste into the template the **live flow** uses (CODE editor only — drag-and-drop flows must be switched to a Custom HTML block first).

## `klaviyo-exports/` — read-only snapshots (reference)

Point-in-time exports of Klaviyo templates pulled via the Templates API. **Reference only — not pasted; Klaviyo is the live source.** Some are `SYSTEM_DRAGGABLE` (drag-and-drop, rendered output, not re-importable). See [`klaviyo-exports/INDEX.md`](klaviyo-exports/INDEX.md) for the re-export command and the id/editor-type map.
