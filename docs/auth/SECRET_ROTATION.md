# Secret rotation runbook (auth JWTs)

How to rotate the secrets that sign our auth tokens. There is intentionally **no
zero-downtime, dual-secret/`kid` rotation machinery** — for this app, rotation is
an infrequent, deliberate act (incident response or scheduled hygiene), and a
one-time re-login is an acceptable cost. Building grace-window infrastructure
would be speculative complexity (see CLAUDE.md §4). Each token family has its own
secret so you can rotate one without disturbing the others.

## The secrets and what each rotation invalidates

| Secret | Signs | Rotating it logs out… |
|---|---|---|
| `NEXTAUTH_SECRET` | the NextAuth member session (`next-auth.session-token`) **and** the short-lived auto-login/verify-login-code **bridge** tokens (`src/lib/jwt.ts`) | every signed-in **member** (they log in again). Bridge tokens are seconds-lived, so no practical impact there. |
| `AFFILIATE_JWT_SECRET` | the affiliate portal token (`affiliate_token` / `__Host-affiliate_token`) | every signed-in **affiliate** (they log in again). Falls back to `NEXTAUTH_SECRET` when unset — see below. |

These are **separate** key spaces: a member token can't be replayed as an
affiliate token (distinct issuer/audience are enforced on verify), and rotating
one secret does not touch the other.

## Procedure

1. Generate a new value: `openssl rand -hex 32` (32+ chars).
2. Set it in the environment for every deploy target (Vercel: Production +
   Preview; and your `.env.local` for dev):
   - Member/NextAuth: `NEXTAUTH_SECRET`
   - Affiliate: `AFFILIATE_JWT_SECRET`
3. Redeploy. Old tokens signed with the previous secret immediately fail
   verification; affected users are bounced to the login screen and sign in once.
4. Communicate the forced re-login if rotating during business hours.

## First-time affiliate key separation (one-off)

Today affiliate tokens fall back to `NEXTAUTH_SECRET` when `AFFILIATE_JWT_SECRET`
is unset. To activate full key separation:

1. Generate `AFFILIATE_JWT_SECRET` (a value **different** from `NEXTAUTH_SECRET`).
2. Set it on all deploy targets and redeploy.
3. Effect: existing `affiliate_token`s (signed with `NEXTAUTH_SECRET`) stop
   verifying → affiliates log in once and receive a token signed with the
   dedicated secret. (Note: even without setting this var, the deploy that
   introduced enforced affiliate issuer/audience already triggers that one-time
   affiliate re-login, because pre-existing affiliate tokens carry no audience.)

## When to rotate

- **Incident:** any suspected leak of a secret, a `.env` exposure, or a
  compromised deploy. Rotate immediately; accept the re-login.
- **Offboarding:** when someone with production env access leaves, rotate.
- **Hygiene:** optional periodic rotation (e.g. yearly). Not required for
  correctness — our tokens are short-lived (bridge) or independently revocable
  (NextAuth `tokenVersion`/`isActive`; affiliate `isActive` re-check on verify).
