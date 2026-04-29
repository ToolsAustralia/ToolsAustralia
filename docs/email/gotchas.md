# Email — Gotchas

## Templates at repo root, not under src/

CLAUDE.md flags this — templates live at the repo ROOT (`*-email-template.html`). Easy to miss when scanning `src/`. Always check the root for email-related changes.

## Preview ≠ production render

The preview app runs in the browser; production renders on the server. They use the same template files but different rendering paths. Differences in how variables interpolate or how images load can hide bugs that only appear in production.

## Klaviyo ↔ SendGrid suppression sync

If a user unsubscribes via Klaviyo, the SendGrid suppression list might not auto-update. _TODO: verify the sync mechanism — likely a webhook or scheduled sync._ Until then, bouncing between providers can re-mail unsubscribed users.

## Migrated from `docs/EMAIL_MODULE.md`

> _TODO: read root file and merge full content._
