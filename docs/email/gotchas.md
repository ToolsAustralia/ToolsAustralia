# Email — Gotchas

## Templates live under `email-templates/`, not `src/`

Two subfolders: `email-templates/klaviyo/` = the **paste-ready Klaviyo** custom-HTML templates (invoice, subscription-renewal, renewal-failed, subscription-payment-failed, draw-reminder); `email-templates/klaviyo-exports/` = **read-only export snapshots** (reference only). Easy to miss when scanning `src/`. There are **no SendGrid HTML files** — every SendGrid email (incl. staff-invite, migrated to code June 2026) is code-as-source in `src/lib/email/templates.ts` + `components.ts`. Nothing is runtime-loaded from disk anymore, so there's no `process.cwd()` / file-tracing footgun.

## One support line, in the footer only

`support@toolsaustralia.com.au` belongs in the **footer** (rendered by `components.ts` for SendGrid, duplicated in each Klaviyo file's footer). Do **not** add a secondary "Need a hand? / Questions about this order? / just keeping you in the loop" support line in the email **body** — it duplicates the footer. Those body lines were removed from the invoice, renewal, renewal-failed, and signup-payment-failed templates June 2026.

## Preview ≠ production render

The preview app runs in the browser; production renders on the server. They use the same template files but different rendering paths. Differences in how variables interpolate or how images load can hide bugs that only appear in production.

## Klaviyo ↔ SendGrid suppression sync

If a user unsubscribes via Klaviyo, the SendGrid suppression list might not auto-update. _TODO: verify the sync mechanism — likely a webhook or scheduled sync._ Until then, bouncing between providers can re-mail unsubscribed users.

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
