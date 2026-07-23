# Panel review — `feature/winner-testimonies` (register privileged-account guard)

- **Date:** 2026-07-23
- **Base ref / diff:** `git diff origin/main` (working tree vs `origin/main` @ `ff6e20af`). Reviewed the **uncommitted** security fix; the earlier `getBaseUrl` commit `f98d72c7` is already merged into `origin/main`, so it's out of scope here.
- **PR:** none open. **Acceptance NOT graded** (no PR/issue) — Reviewer F dropped; 5 code-health reviewers ran.
- **Touched domains (Domain Manifest):** `auth` (`src/app/api/auth/**`, `src/utils/auth/**`), `infrastructure` (`package.json`). Docs touched: `docs/auth/gotchas.md`, `CUSTOMER.md`, `docs/infrastructure/testing.md`.
- **Artifact:** https://claude.ai/code/artifact/bcafc1eb-9e94-45df-af93-746da1ac7d3d (security-fix report + recorded demo)
- **Static gate:** `type-check` clean (exit 0); `lint` = **baseline only** (6 pre-existing errors in `e2e/fixtures/`, `scripts/codemod-dark-text.js`, `scripts/migrate-klaviyo-draw-properties.ts`; 0 new). Ran `npm run test:privileged-account` → **8/8 pass**. Live proof: recorded Playwright demo (`Desktop/privileged-account-guard-demo.mp4`) — both attack shapes blocked, staff account unchanged.
- **Ship verdict:** the register privileged-account fix is **correct, complete, and ship-ready** (all 5 reviewers concur the reported hole is fully closed). The panel surfaced one **independent P0 (`send-otp`)** outside this diff that should be fixed ASAP but does not block this change.

## Handoff

Fresh session? Run `/panel-fix` on this branch, or paste:

> Read `docs/tech-debt/panel-review-feature-winner-testimonies.md`. Fix ONLY the Now items: F-001.
> Findings were written against the working tree at 2026-07-23 (register route ~line 344-381) — re-grep each `file:line`, they may have moved.
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with a reason.

**Now (do these):** F-001 — `send-otp` OTP-delivery hijack (P0, independent takeover).
**Next:** F-003 (e2e coverage for the guard), F-004 (residual mobile email-rebind + isEmailVerified carryover), F-005 (pre-existing mobile-match email disclosure).
**Later:** F-006 (register 400 copy hygiene).

---

## Findings

- [x] **F-001** · ~~P0~~ → **FIXED 2026-07-23** (was downgraded to latent; fixed proactively) · Security · `src/app/api/auth/send-otp/route.ts` — SMS login code is sent to an attacker-supplied phone number.
      _What:_ `send-otp` resolves the account by **email** (`:58`), stores the OTP on it (`:88-91`), then sends the SMS to `validatedData.mobile` — the **request body's** number, not the stored `user.mobile` (`:96`). If SMS OTP login were live, an attacker who knows a paying member's email could POST `{email: victim, mobile: attackerPhone}`, receive the code, and complete a login as the victim. **Independent, pre-existing — NOT introduced by this diff.**
      _Status (2026-07-23, verified):_ **NOT exploitable in production today.** (a) No `TWILIO_*` env vars are configured — absent from `.env.production`, `.env.local`, AND the `.env.example` registry — so `sms.ts`'s real Twilio client can't deliver a code in prod. (b) `verify-otp` returns user JSON but issues **no session** (no NextAuth `signIn`/cookie), so the raw API chain doesn't complete a login by itself. Downgraded from live-P0 to a **pre-launch blocker**: MUST be fixed before SMS-OTP login is enabled (before Twilio is provisioned) or launch day ships a takeover. _Caveat:_ Vercel prod env not directly inspected — if `TWILIO_*` is set there, re-escalate to live P0.
      _Fix:_ In `send-otp/route.ts:96` send to `user.mobile` (400 if absent), and delete `mobile` from `sendOTPSchema` (`:9`) so the client can't supply a delivery target. _Handled:_ **FIXED 2026-07-23** — `mobile` removed from `sendOTPSchema`; delivery now goes only to `user.mobile` (400 if none/invalid on file). Type-check clean. Remaining pre-launch item: drop the now-ignored mobile input in `PasswordlessLoginModal` when SMS-OTP is enabled (UX only).

- [x] **F-002** · P1 · Security · `src/app/api/auth/register/route.ts` (mobile-match privileged reject) — **FIXED 2026-07-23**. The new privileged **mobile**-match rejection echoed `existingAccountEmail: existingUserByMobile.email`, disclosing a staff/admin login email to an anonymous caller who only supplied the mobile (feeds F-001/email-code login). _Fix applied:_ dropped `existingAccountEmail` from that branch (kept `isExistingAccount` so the "please log in" modal still shows; email-match branch keeps it since the caller already supplied that email). _Handled:_ 2026-07-23 (this session). Raised independently by Reviewers A, E, B — convergent.

- [ ] **F-003** · P1 · Test · `e2e/specs/auth/registration.spec.ts`, `e2e/seed/users.ts:61`, `e2e/helpers/db.ts:11` — the guard's route integration is untested and the e2e seed lacks the critical staff shape.
      _What:_ `test:privileged-account` proves the predicate in isolation, but nothing verifies it's wired into the route (email-match reject at `register/route.ts:356` + mobile-match reject at `:369`). A refactor could drop/transpose a guard and keep the unit test green while re-opening the hole. The only seeded staff account (`e2e/seed/users.ts:52`) is the legacy `userType:"admin"` shape — the `userType:"staff"` + `role:"user"` shape (2 of 3 real staff) is seeded nowhere.
      _Fix:_ Add `STAFF` creds to `e2e/helpers/db.ts:11`; seed a `{role:"user", userType:"staff", roleId:new ObjectId(), ...}` user in `e2e/seed/users.ts`; add two `@smoke` cases in `registration.spec.ts` — register with the staff email → 400 `field:"email"` + account unchanged; register with the staff mobile → 400 `field:"mobile"` + staff `email` unchanged. _Handled:_ —

- [ ] **F-004** · P2 · Security (residual, pre-existing) · `src/app/api/auth/register/route.ts:702-710` (+ `:465`, `:609`) — a non-staff plain customer's account can be taken over by mobile.
      _What:_ For a plain (non-privileged) account matched by **mobile only**, the route overwrites its `email` with the submitted one and does not reset `isEmailVerified`, so an attacker who knows a zero-entry customer's mobile can rebind the login email to themselves and sign in via email code. Low real-world value (empty target); disclosed in `docs/auth/gotchas.md`.
      **⚠ INTENT (do NOT "fix" by removing the overwrite):** the plain-account overwrite — by email **and** by mobile — is a **deliberate guest-funnel feature**. Step-1 register is passwordless and does not log the user in; a guest who registered but didn't pay (plain, 0 entries, no password) must be able to re-enter and correct a typo'd email/name/mobile, or they dead-end on their own incomplete signup. The mobile-only email rebind is exactly the "same person fixes their email" path. Rejecting/blocking it would break conversion. Only touch the security amplifier, not the overwrite.
      _Disposition — **ACCEPT (won't fix)**, 2026-07-23:_ this residual is the flip side of the intended guest-re-entry overwrite (above) and cannot be closed without breaking it. The one proposed mitigation (reset `isEmailVerified` on email change) was evaluated and is only a **speed bump, not a block** — `send-email-verification`/`verify-email` are unauthenticated and the attacker controls the rebound email, so they simply re-verify and continue. Combined with a **zero-value target** (plain = 0 entries, no purchase, no card, no membership; staff & converted accounts already reject), the risk does not justify the UX cost. Revisit only if plain accounts ever gain pre-purchase value. _Handled:_ accepted as documented residual — no code change.

- [ ] **F-005** · P2 · Security (pre-existing) · `src/app/api/auth/register/route.ts:416,457` — the pre-existing converted/saved-payment mobile-match rejections disclose the matched account's email the same way F-002 did.
      _What:_ Same root cause as F-002 but for paying customers (not touched by this diff). An anon caller supplying a customer's mobile receives that customer's email in the 400 body (and it prefills the login modal).
      _Fix (mirror F-002 exactly):_ Drop **only** `existingAccountEmail` from the mobile-match converted and saved-payment-method rejection branches — **KEEP `isExistingAccount: true`** so the "please log in" modal still opens for the returning customer (dropping it would downgrade them to an inline error — a UX regression). This is the same shape as the applied F-002 fix. _Handled:_ —

- [ ] **F-006** · P2 · Copy (optional) · `src/app/api/auth/register/route.ts:362,375` — the new 400 `message` strings are never displayed.
      _What:_ Because the privileged rejections set `isExistingAccount:true`, `MembershipModal` opens `ExistingAccountModal` (hardcoded copy, ignores `message`) — so the new strings only ever surface to API consumers/logs. Purely cosmetic; copy is §11-clean and does not leak staff status.
      _Fix:_ Optional — either align the `message` tails with the sibling 400s (`"…Please log in or use a different email address."`), or leave as-is. Do NOT make only the staff-guard messages more helpful (that would be a distinguishing tell). _Handled:_ —

## Reviewer notes / overrides

- **Convergence:** the staff-email disclosure (F-002) was independently raised by Reviewers A, E, and B — strong signal; fixed.
- **Reviewer B correction (rendering the real path):** the register 400 `message` is dead-for-display — the user actually sees `ExistingAccountModal`'s hardcoded copy, which makes a staff collision **byte-identical** to a converted-customer collision (no staff-status leak at the UI). This corrected the initial "evaluate the message copy" premise and confirmed Point-1 (no privileged-status disclosure) PASSES.
- **Overridden — none.** F-004/F-005/F-006 are accepted as follow-ups (pre-existing, low value / cosmetic), not downgraded findings.
