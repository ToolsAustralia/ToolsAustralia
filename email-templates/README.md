# Email templates

Single organized home for every email template source. (Previously the SendGrid
HTML lived loose at the repo root.)

## `sendgrid/` — transactional (source of truth)

Hardened HTML for transactional emails:

- `invoice-email-template.html`
- `renewal-failed-email-template.html`
- `staff-invite-email-template.html` — **runtime-loaded** by [`src/lib/email/staff-invite.ts`](../src/lib/email/staff-invite.ts) via `process.cwd()`. Moving/renaming it means updating that path **and** confirming Next still file-traces it into the serverless bundle.
- `subscription-payment-failed-email-template.html`
- `subscription-renewal-email-template.html`

For most transactional sends the live HTML is generated in `src/lib/email/templates.ts` and mirrored by the dev preview components (`src/components/email-preview/`); these files are the hardened source. Keep them in lockstep with `src/lib/email/` (CLAUDE.md R2).

## `klaviyo/` — marketing (read-only snapshots)

Exports of the Klaviyo marketing templates pulled via the Templates API. **Klaviyo is the source of truth — edit in the Klaviyo app, not here.**

- `CODE` templates: plain HTML, can be edited and PATCHed back via the API.
- `SYSTEM_DRAGGABLE` templates: drag-and-drop; the exported HTML is *rendered* output and can't be cleanly re-imported. Edit those in Klaviyo's visual editor.

See `klaviyo/INDEX.md` for the id / editor-type map, and `docs/email/` for rules — including **R6: customer-facing entry copy reads "free entries"**.
