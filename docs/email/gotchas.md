# Email — Gotchas

## Templates live under `email-templates/`, not `src/`

SendGrid source templates are in `email-templates/sendgrid/*.html`; Klaviyo platform exports (read-only snapshots) are in `email-templates/klaviyo/`. Easy to miss when scanning `src/`. The staff-invite email is the one **runtime-loaded** template — `src/lib/email/staff-invite.ts` reads `email-templates/sendgrid/staff-invite-email-template.html` via `process.cwd()`; if you move it again, update that path (and verify Next still file-traces it into the serverless bundle).

## Preview ≠ production render

The preview app runs in the browser; production renders on the server. They use the same template files but different rendering paths. Differences in how variables interpolate or how images load can hide bugs that only appear in production.

## Klaviyo ↔ SendGrid suppression sync

If a user unsubscribes via Klaviyo, the SendGrid suppression list might not auto-update. _TODO: verify the sync mechanism — likely a webhook or scheduled sync._ Until then, bouncing between providers can re-mail unsubscribed users.

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
