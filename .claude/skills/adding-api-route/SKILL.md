---
name: adding-api-route
description: Use when adding a new endpoint under src/app/api/**, exposing a feature over HTTP, building a route handler, or creating an admin-only API. Triggers on phrases like "add an API endpoint", "create a route", "expose this via HTTP", "/api/...", "POST/GET handler".
---

# adding-api-route

## When to use
Adding any new file under `src/app/api/**/route.ts` (or `[id]/route.ts`), or extending an existing handler with a new HTTP method. Do **not** use for `src/app/api/stripe/**` — use `adding-stripe-endpoint` instead.

## Steps
1. Decide the route path. Mirror sibling folder names. Admin endpoints go under `src/app/api/admin/<domain>/`.
2. Identify (or create) the matching service in `src/services/<domain>/` or util in `src/utils/<domain>/`. **All non-trivial logic belongs there, not in `route.ts`.**
3. Create `src/app/api/<path>/route.ts` exporting `GET`/`POST`/`PATCH`/`DELETE` async functions. Use `NextRequest` / `NextResponse` from `next/server`.
4. In each handler: (a) authorize, (b) `await connectDB()` from `@/lib/mongodb`, (c) parse + validate input, (d) delegate to the service, (e) return JSON.
5. If the route lives under `/api/admin/`, **also** add the admin gate inside the handler (middleware does not gate `/api`).
6. Update the matching `docs/<domain>/` page (the doc-sync hook will block otherwise — see CLAUDE.md Domain Manifest for the file→domain map).

## Conventions
- Auth helpers are in `src/lib/api-auth.ts`: `requireAuthenticatedUser()` for user routes, `requireAdminUser()` for admin routes. Both return `{ errorResponse }` on failure — early-return that.
- Response shape is **always** `{ success: true, data: ... }` or `{ success: false, error: "..." }, { status: <code> }`. See `src/app/api/redeemables/route.ts` for the canonical pattern.
- Wrap the body in `try/catch`; on error log with `console.error` (production strips `console.log/info/debug/warn` per `next.config.ts`) and return `{ success: false, error: "..." }` with status 500.
- Validate query params / bodies with the helpers in `src/lib/zod/` where applicable. Whitelist enums (see `VALID_STATUSES`-style consts in `src/app/api/admin/error-reports/route.ts`).
- Never import `mongoose` from a client component — it is in `serverExternalPackages`.
- Match the response shape of sibling routes in the same folder before inventing a new one.

## Verification
```bash
npm run lint
npm run type-check
# If a service has a test, run it:
npm run test:<scope>
```
After saving, check the Stop hook output — if it says `BLOCKED: Stale docs`, update the `docs/<domain>/` files it lists. **Do not** run `git add`/`commit` yourself; ask the user.
