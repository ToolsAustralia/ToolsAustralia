# Email domain

Transactional email via SendGrid; HTML templates at repo root; SMS via separate provider; newsletter integration with Klaviyo (Klaviyo lives in [tracking](../tracking/) for marketing flows).

## Index

- [architecture.md](./architecture.md) — providers, template structure, send paths
- [frontend.md](./frontend.md) — `/email-preview/` page, components/email-preview/
- [backend.md](./backend.md) — `lib/email`, `lib/sms`, template rendering
- [api.md](./api.md) — `/api/newsletter/`
- [rules.md](./rules.md) — provider split (SendGrid transactional, Klaviyo marketing)
- [patterns.md](./patterns.md) — template lockstep with code
- [gotchas.md](./gotchas.md) — preview workflow, root template files
- [models.md](./models.md) — _N/A — emails aren't persisted; uses User for recipients_
- [testing.md](./testing.md) — `docs/SENDGRID_TESTING_GUIDE.md`
- [staff-invite.md](./staff-invite.md) — staff invite template + `sendStaffInviteEmail` helper

## Migrated from

- `docs/EMAIL_MODULE.md` → architecture.md
- `docs/SENDGRID_TESTING_GUIDE.md` → testing.md

> _TODO: read both root files and merge._
