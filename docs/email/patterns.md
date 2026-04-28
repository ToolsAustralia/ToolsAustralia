# Email — Patterns

## P1. Template + helper in lockstep

Every HTML template at repo root has a paired rendering helper in `src/lib/email/`. Adding a new template? Add its helper. Renaming a variable? Update both.

## P2. Preview before send

The `/email-preview/` app renders templates locally with sample data. Use it before deploying template changes — visual regression catches what diff tools miss.

## P3. Provider-specific sending logic isolated

`lib/email/` has SendGrid-specific code; future providers should be plugged via the same interface. Don't sprinkle SendGrid SDK calls across the codebase.

## P4. Server-side render, client-side preview only

Production emails are rendered + sent from server code. The `/email-preview/` page is client-side rendering for QA only — don't use it as a render path in production.
