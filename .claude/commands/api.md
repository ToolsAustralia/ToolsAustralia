---
description: Add an API endpoint. Routes between adding-api-route and adding-stripe-endpoint, enforces layering, hands off to /ship.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <endpoint description>
---

# /api — Add an API endpoint

You are adding an API endpoint for: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "Which endpoint? (method, path, purpose, auth)" and wait.

## Step 1 — Route to the right skill
- If `$ARGUMENTS` mentions Stripe, subscription, invoice, payment intent, setup intent, or webhook event → invoke `adding-stripe-endpoint`.
- Otherwise → invoke `adding-api-route`.

Both skills enforce the layering rule: validate + authorize in `route.ts`, business logic in `src/services/<domain>/`. Do **not** put business logic in the handler.

## Step 2 — Manifest check
Before saving the new file, confirm the path matches a `paths` glob in the Domain Manifest in `CLAUDE.md`. If not, invoke `registering-new-domain` to extend an existing domain or create a new one — do not save first and let the doc-sync hook fail.

## Step 3 — Auth gate
If the route is under `/api/admin/`, add the admin gate inside the handler (`requireAdminUser()` from `src/lib/api-auth.ts`). Middleware does **not** gate `/api`.

## Step 4 — Response shape
Match sibling `route.ts` files in the same folder. Default is `{ success: true, data }` / `{ success: false, error }, { status }` — see `src/app/api/redeemables/route.ts` for the canonical example.

## Step 5 — Docs in lockstep
Update the matching `docs/<domain>/` page in this turn. If the domain is large or unfamiliar, run `/doc-domain <key>` instead. The doc-sync Stop hook will block otherwise.

## Definition of done
- Route file at `src/app/api/<path>/route.ts` — thin handler delegating to a service
- Auth gate present (admin if applicable)
- Response shape matches siblings
- Service in `src/services/<domain>/` holds the logic
- `docs/<domain>/` updated
- Tell the user: "Implementation in place — run `/ship` to verify."
