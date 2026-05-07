import { test } from "../fixtures/test";

// BLOCKED: there is no public /register page in this codebase.
//
// Investigation summary:
//   - `/api/auth/register` exists (src/app/api/auth/register/route.ts).
//   - `/login` redirects "Need an account? → Create one" to `/membership`, NOT
//     a register form. The membership page funnels users through MembershipModal
//     + Stripe checkout, which calls the registration endpoint as part of the
//     subscription flow.
//   - There is NO standalone form that posts to /api/auth/register.
//   - ExistingAccountModal exists (src/components/modals/ExistingAccountModal.tsx)
//     but is consumed by MembershipModal, not by a registration form.
//
// To unblock: add a /register page (or a registration form rendered inside
// /login) and re-author this spec against that surface. Until then, registration
// is exercised end-to-end via the membership purchase flow (e2e/membership/join.spec.ts).
test.skip("BLOCKED: no /register page exists; see comment for investigation", async () => {
  // intentionally empty
});
