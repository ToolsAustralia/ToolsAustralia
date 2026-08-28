# Auth — Testing

## Automated

| Command | Covers |
| --- | --- |
| `npm run test:signup-attribution` | [`src/services/attribution/signup-attribution.ts`](../../src/services/attribution/signup-attribution.ts) — the gate deciding whether a signup's promo page, built prize and paid-click platform reach the database. Pure, no DB/env. Pins: the three-way persist guard (promo **or** UTM **or** click), `builtPrizeSlug` **not** being a standalone trigger, an invalid built prize being *absent* rather than `undefined`-valued (a literal `undefined` in a `$set` writes the key), slug lowercase+trim, an **argument-position guard** (four distinct values in one call, each asserted onto its own key — the merge hazard from F-038), and the F-019 merge rules: preserve-when-absent for the promo fields, last-write-wins elsewhere, plus the `...previous` spread that protects the whole UTM/campaign snapshot. |
| `npm run test:mobile-otp` | [`src/utils/auth/__tests__/mobile-otp.test.ts`](../../src/utils/auth/__tests__/mobile-otp.test.ts) — the OTP policy in [`mobile-otp.ts`](../../src/utils/auth/mobile-otp.ts). Pins: 6-digit codes over the **full** `000000`–`999999` range (a leading `0` must be reachable), the keyed HMAC hash (different `NEXTAUTH_SECRET` ⇒ different digest; missing secret ⇒ throw), constant-time verify, expiry maths, and the **dev bypass** — the thing most worth pinning, since a bypass leaking into production would remove all spend protection. `SMS_OTP_RATE_LIMIT_IN_DEV=true` re-enables the limiter locally so it can be exercised at all. Pure only: the claim path talks to Mongo, so it is driven through the bypass. |
| `npm run test:has-ever-paid` | [`src/utils/auth/__tests__/has-ever-paid.test.ts`](../../src/utils/auth/__tests__/has-ever-paid.test.ts) — the predicate gating who can trigger a paid SMS send. Pins **both** expensive failure directions against the six real production account shapes: `stripeCustomerId` must NEVER count (register creates it before any payment, so ~44,400 never-paid accounts carry one), and past-due / paused / cancelled / one-time-only payers must ALL still count (gating on `subscription.isActive` would lock out 4,613 real payers, including past-due members holding live draw entries). Also covers the webhook race — `processedPayments` is written asynchronously, so a buyer must not be refused in the seconds after checkout — and the `[]`-is-truthy trap. |
| `npm run test:privileged-account` | `src/utils/auth/__tests__/privileged-account.test.ts` — the public registration path can never create or overwrite a staff/admin account; anchors that the staff marker is `roleId`/`userType`, **not** the legacy `role` string. See [gotchas.md](./gotchas.md). |
| `npm run test:user-setup` | `src/components/modals/UserSetupModal/__tests__/UserSetupModal.test.ts` — server-renders the setup sub-components. Owned by [shared-ui](../shared-ui/), listed here because it is the only automated check on **step 3**, the surface that enforces the verified-contact requirement ([rules.md](./rules.md) R8): it pins the renamed `Step3VerifyContact` and its full prop contract, so dropping a channel-picker prop fails the build rather than silently rendering an empty tab. It does **not** exercise the state machine or the routes. |

| `npm run test:api-auth-permissions` | [`src/lib/__tests__/api-auth-permissions.test.ts`](../../src/lib/__tests__/api-auth-permissions.test.ts) — `hasPermissionInList` presence/absence/empty-list behaviour, and that `LEGACY_ADMIN_ALL` stays the full frozen `PERMISSIONS` array. Pure assertions, but it reaches them through a **dynamic** import of `@/lib/api-auth-permissions`, which is why it needs `.env.local` loaded first. |

All of these are standalone `tsx` scripts (no jest/vitest) — see [infrastructure/testing.md](../infrastructure/testing.md).

**A suite that imports `@/lib/auth` must `process.exit(0)` on success.** `@/lib/auth` opens a Mongo
handle at module load, and nothing in these scripts closes it, so a suite that simply falls off the
end of `main()` prints `All tests passed` and then **hangs forever** — the assertions have already
passed, so the only symptom is a command that never returns and a `&&` chain that never advances.
`test:api-auth-permissions` did exactly that until 2026-08-28 (as did `test:staff-activity`); both
now exit explicitly, matching the ~25 other suites that already do. `test:permissions` is the
contrast case — same directory, no hang, because it uses static imports and never pulls in
`@/lib/auth`. If you add a suite here that touches auth, add the `exit(0)` or you will hand the next
person a "stuck" test run with a green message on screen.

## Manual smoke

- Email signup → verify `User` row, session works
- Google OAuth → verify session works
- Password reset → token-based flow
- Admin access → verify admin pages and API routes
- Logout → session cleared
- SMS delivery → `npm run smoke:sms-send -- <mobile>` sends a **real** message and spends credits; it refuses unless `SMS_ENABLED=true`

## Anti-checks

- Try `/api/admin/*` without admin role → must 401/403
- Try `/admin/*` without auth → must redirect via middleware

## No automated coverage yet — the 2026-08-27 routes

`send-mobile-verification`, `verify-mobile` and `session-from-payment` have **no `tsx` suite**.
Each is a route handler whose logic is session/Stripe/Mongo I/O, and the pure parts they lean on
are already pinned — the OTP policy by `npm run test:mobile-otp`, the spend predicate by
`npm run test:has-ever-paid`. Extract to a pure module first if you add behaviour worth testing;
don't stand up a route harness for one handler.

## Manual smoke — verification, the dashboard gate, and 3DS (2026-08-27)

SMS steps need `SMS_ENABLED=true` and spend real credits.

- **Mobile verification** — signed-in member with an unverified mobile → Settings → Profile → the
  mobile row's *Verify* → code arrives on the number **on file** → row flips to Verified, and the
  outer banner drops its amber state. Then confirm `POST /api/auth/verify-mobile` returned no session cookie:
  the caller already had one, and this route must never mint a second way in.
- **Body cannot redirect the code** — POST `send-mobile-verification` with a body naming a
  different number. The body is ignored by construction; the code must still land on the account's
  own mobile. This is the F-001 shape and is worth re-checking by hand after any edit to that route.
- **Verified-contact requirement** — a member with **neither** channel verified must not be able to
  finish setup; verifying **either** one releases step 3. Check the restore path too: leave
  mid-flow and come back — the restored step must match the rendered step (both now derive
  from `computeStepsNeeded`; they used to be computed separately and drifted).
- **Dashboard gate** — sign in as a never-paid account → `/my-account` and `/rewards` both land on
  `/membership`. Then a **cancelled** or **past-due** payer → both must still open. A staff account
  still goes to `/admin`.
- **3DS session** — complete a purchase with a card that forces a 3DS challenge. After Stripe's
  redirect, the success page must become **signed in** on its own, with no spinner, no toast, and
  no visible failure if the sign-in does not land.

## Anti-checks — the 2026-08-27 routes

- `POST /api/auth/verify-mobile` or `send-mobile-verification` while signed out → must 401.
- `POST /api/auth/session-from-payment` with a client secret whose PaymentIntent is
  `requires_action` or `processing` → must `409` with no token. (This is the check `auto-login`
  never had — see [gotchas.md](./gotchas.md).)
- Same route with the right `pi_…` id but a tampered `_secret_` suffix → must `403`.
- Same route for a `succeeded` intent whose customer has no `User` yet → must `202 {pending:true}`,
  not an error.
