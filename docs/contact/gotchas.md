# Contact — Gotchas

## Spam

Public endpoint = spam target. Verify rate-limiting + honeypot fields work. _TODO: audit current anti-spam._

## No auto-reply

Submitters don't currently receive an email confirmation. If you add one, route through SendGrid (transactional) per [email](../email/).
