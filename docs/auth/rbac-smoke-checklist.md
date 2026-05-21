# RBAC smoke checklist

Run this in a clean dev session before merging the user-roles branch to main and again after deploying to staging. Each check should be a hard PASS — flaky / partial is a FAIL.

## Prerequisites

1. `npm run migrate:seed-staff-roles:dry` on the target database — confirm Admin + Ads Manager will be created / synced.
2. `npm run migrate:seed-staff-roles` for real.
3. Confirm in Atlas: the `roles` collection has two documents (`Admin`, `Ads Manager`) and your own user has `userType: "admin"`, `roleId: <Admin._id>`.

## Catalog + unit tests

```bash
npm run type-check
npm run lint
npm run test:permissions
npm run test:api-auth-permissions
```

All four must pass with no errors. The permission tests double as the catalog invariants — they fail when a new permission is added without a description, or when a destructive sub-action isn't marked `danger`.

## Browser smoke (logged in as the seeded admin)

1. **Sidebar.** Every group + tab is visible. Hitting Settings opens the new tab.
2. **Staff sub-tab.** Your own row is listed with the **Crown** icon, the "You" pill, and the **Remove** button is disabled.
3. **Roles sub-tab.** Admin appears with the System badge and a red dot; Ads Manager appears with an amber dot. Selecting Admin shows all rows greyed out and the "permissions are managed by the seed script" notice.
4. **Create role.** Click `+` → name = "Customer Support" → pick a color → Create. New role auto-selects with zero permissions.
5. **Grant permissions.** Toggle `users.view`, `users.edit`, `users.cancelSubscription`, `submissions.view`. Click **Save**. Sidebar member count for the role stays at 0; permission count updates.
6. **Customer-route block.** Visit `/my-account` or `/shop` — you (as `userType: "admin"`) should pass through and load the page normally (admin is the super-role).
7. **Invite staff.** Settings → Staff → Invite. Use an email you control + the Customer Support role. Send invite.
8. **Invite email.** Receive the SendGrid email. Confirm: subject "You've been invited to Tools Australia Admin (Customer Support)", brand red CTA, expiry note "7 days".
9. **Staff setup page.** Open the link → "Welcome, <first name>" page. Set a password ≥ 8 chars → submit → redirected to `/login?email=…&staffSetup=ok`.
10. **First staff login.** Log out, log in as the invited user. Land in `/admin`.
11. **Restricted sidebar.** As Customer Support, the sidebar shows only Users + Submissions + the Settings tab (or whichever subset matches the granted permissions). Other groups collapse out entirely.
12. **Customer-route block (staff).** As Customer Support, visit `/my-account` → redirected to `/admin`. Same for `/shop`, `/affiliate`, `/checkout`.
13. **API denials.** As Customer Support, hit `/api/admin/users/<id>/delete` (DELETE) — expect `403 Forbidden`. Then hit `/api/admin/users/<id>/cancel-subscription` (POST) — expect `200` if you granted that perm, `403` otherwise.
14. **Role change.** Log back in as admin → Settings → Staff → change Customer Support user's role to Ads Manager. Wait ≤5 min OR have them sign out / back in. Their sidebar now reflects Ads Manager.
15. **Resend invite.** Pick a still-pending invite (or invite a fresh email and don't open it). Click the Send icon → email re-arrives with a new token. Old token returns `410` from `/staff-setup/<old>`.
16. **Remove staff.** Remove the test user → modal explains demotion → confirm. User row disappears from Staff; the underlying `User` document remains in Mongo with `userType: "customer"` and `roleId: null`.
17. **Last-admin guard.** Settings → Staff → try removing your own row → button is disabled. Settings → Roles → Admin → Delete button is disabled.
18. **Role deletion with members.** Create a temp role, invite or move a staff member into it, then try to delete the role → `409 "Cannot delete: 1 staff member(s) still hold this role"`.
19. **Permission cache TTL.** While logged in as staff with no recent re-login, change their role from admin. The new permissions can take up to 5 minutes (`PERM_TTL_MS` in `src/lib/auth.ts`) to take effect for that session, unless the user signs out + back in.

## Cleanup

- Delete or demote the test staff account.
- Delete the temp role(s) you created.
- Confirm the `roles` collection is back to the seeded set + any production roles you intend to keep.

## Phase 5 (out of scope here)

The legacy `User.role: "user" | "admin"` field and the legacy admin bridge in `src/lib/api-auth-permissions.ts` stay in place for one deploy cycle. After this branch has been stable in production, a follow-up PR drops both.
