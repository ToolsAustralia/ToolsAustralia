# Auth — Testing

## Automated

| Command | Covers |
| --- | --- |
| `npm run test:signup-attribution` | [`src/services/attribution/signup-attribution.ts`](../../src/services/attribution/signup-attribution.ts) — the gate deciding whether a signup's promo page, built prize and paid-click platform reach the database. Pure, no DB/env. Pins: the three-way persist guard (promo **or** UTM **or** click), `builtPrizeSlug` **not** being a standalone trigger, an invalid built prize being *absent* rather than `undefined`-valued (a literal `undefined` in a `$set` writes the key), slug lowercase+trim, an **argument-position guard** (four distinct values in one call, each asserted onto its own key — the merge hazard from F-038), and the F-019 merge rules: preserve-when-absent for the promo fields, last-write-wins elsewhere, plus the `...previous` spread that protects the whole UTM/campaign snapshot. |
| `npm run test:privileged-account` | `src/utils/auth/__tests__/privileged-account.test.ts` — the public registration path can never create or overwrite a staff/admin account; anchors that the staff marker is `roleId`/`userType`, **not** the legacy `role` string. See [gotchas.md](./gotchas.md). |

Both are standalone `tsx` scripts (no jest/vitest) — see [infrastructure/testing.md](../infrastructure/testing.md).

## Manual smoke

- Email signup → verify `User` row, session works
- Google OAuth → verify session works
- Password reset → token-based flow
- Admin access → verify admin pages and API routes
- Logout → session cleared

## Anti-checks

- Try `/api/admin/*` without admin role → must 401/403
- Try `/admin/*` without auth → must redirect via middleware
