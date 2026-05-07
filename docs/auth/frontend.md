# Auth — Frontend

## Pages

- `/login` — login + signup form
- `/reset-password` — token-based reset (renders the request-reset form when no `?token=` is present, the new-password form when a token is present)
- `/oauth-redirect` — OAuth callback handling

> Note: there is **no public `/register` page** — "Need an account?" on `/login`
> links to `/membership`, which funnels users through `MembershipModal` + Stripe
> checkout. The `/api/auth/register` endpoint is called from that flow, not from
> a standalone form.

## Components

[src/components/auth/](../../src/components/auth/) — login form, signup form, password reset, OAuth buttons.

> _TODO: enumerate exact components._

## Context

[src/contexts/UserContext.tsx](../../src/contexts/UserContext.tsx) — exposes session user to React tree. Components consume via `useContext(UserContext)`.

## State conventions

- Session via NextAuth's `useSession()` hook + UserContext
- No Zustand for session

## E2E test IDs

The following `data-testid` attributes are consumed by Playwright specs in
`e2e/auth/`. Source of truth is `e2e/utils/selectors.ts` — when renaming a
field or button, update both the component and the registry.

| Component / file | testid | Notes |
|---|---|---|
| `src/app/login/page.tsx` | `login-email` | Email input on /login |
| `src/app/login/page.tsx` | `login-password` | Password input on /login |
| `src/app/login/page.tsx` | `login-submit` | "Sign in" submit button |
| `src/app/login/page.tsx` | `forgot-password-link` | "Forgot password?" link → /reset-password |
| `src/app/reset-password/page.tsx` | `reset-password-email` | Email input (no-token mode) |
| `src/app/reset-password/page.tsx` | `reset-password-new` | New-password input (token mode) |
| `src/app/reset-password/page.tsx` | `reset-password-confirm` | Confirm-new-password input (token mode) |
| `src/app/reset-password/page.tsx` | `reset-password-submit` | Submit button — same testid for both forms (only one renders at a time, gated by `hasToken`) |
| `src/components/layout/Header.tsx` | `header-user-menu` | Desktop user-menu trigger (collapsed); click to expand the dropdown |
| `src/components/layout/Header.tsx` | `header-logout-button` | "Sign Out" inside the desktop user-menu dropdown |
| `src/app/(site)/my-account/page.tsx` | `dashboard-root` | Outer wrapper of `/my-account`; used to assert post-login navigation |
| `src/components/modals/UserSetupModal.tsx` | `user-setup-modal` | Forwarded via `<ModalContainer testId="user-setup-modal">` |
| `src/components/modals/UserSetupModal.tsx` | `user-setup-dob` | Wrapper around the BirthdatePicker (Step 2) |
| `src/components/modals/UserSetupModal.tsx` | `user-setup-submit` | Modal's primary action button (Next/Complete Setup) — supported via `data-testid` prop on `Button` |

## Spec coverage (e2e/auth/)

| Spec | Project | Asserts |
|---|---|---|
| `login.spec.ts` | `chromium-guest` | Valid credentials redirect to `/my-account`; wrong password shows visible error and stays on `/login` |
| `logout.spec.ts` | `chromium-fresh` | Open header user menu → Sign Out → redirect to `/`; subsequent `/my-account` visit gates to `/login` |
| `forgot-password.spec.ts` | `chromium-guest` | `/reset-password` (no token) email submission returns 2xx with success indicator. Rate-limit (1/5min) NOT asserted to avoid polluting other specs — uses `withFreshMember()` so each run gets a unique email |
| `reset-password.spec.ts` | `chromium-guest` | (a) without `?token=` → request form is visible (no new-password fields); (b) with seeded valid `passwordResetToken` → new-password form submits successfully, token cleared from DB, redirect to `/login` |
| `user-setup-modal.spec.ts` | `chromium-fresh` | Modal opens on `/my-account` when `profileSetupCompleted=false`; with state/profession/birthdate/email pre-populated, `stepsNeeded === []` and the modal auto-completes via `/api/user/setup`, flipping `profileSetupCompleted=true` and closing |
| `email-verification.spec.ts` | `chromium-guest` | API-only (per Phase 3 amendment): POST `/api/auth/verify-email` with valid email + 6-char code → 200, `isEmailVerified` flipped in DB, code/expiry cleared |
| `register.spec.ts` | `chromium-guest` | **BLOCKED** — no `/register` page exists; spec is `test.skip` with investigation notes inline |

## Notes / gotchas

- The `UserSetupModal` is multi-step — `stepsNeeded` is computed from
  `hasPassword`/`state`/`profession`/`birthdate`/`isEmailVerified`. To exercise
  the auto-complete path, seed all required fields and only flip
  `profileSetupCompleted` to `false`. To exercise step 2 manually, omit one of
  state/profession/birthdate.
- `/api/auth/request-password-reset` rate-limits at **1 request per 5 minutes
  per email** — specs that exercise it must use a per-run unique email
  (`withFreshMember()`).
- `/api/auth/me` requires a Bearer JWT (NOT the next-auth session cookie). For
  spec assertions about user state, query the DB directly via dynamic
  `import("@/models/User")` rather than hitting the route.
</content>
</invoke>