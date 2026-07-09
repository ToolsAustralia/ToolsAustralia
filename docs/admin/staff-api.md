# Staff API

Manages the internal user roster (`userType` in `{"staff", "admin"}`). All endpoints live under `/api/admin/staff/**`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/staff` | `settings.view` | Lists every internal user with role + invite status |
| POST | `/api/admin/staff` | `settings.edit` | Creates an inactive `User` (or re-invites an inactive existing one), sends a SendGrid invite |
| PATCH | `/api/admin/staff/:id` | `settings.edit` | Change role, edit first/last name, and/or resend invite |
| DELETE | `/api/admin/staff/:id` | `settings.delete` | Demotes the user to `userType: "customer"` and deactivates |

## userType handling

The three `userType` values behave as follows:

- `"customer"` — public-facing user. Default for new sign-ups. Cannot access admin.
- `"staff"` — custom-role internal user (Ads Manager, Email Marketing, etc.). Blocked from customer-only routes via `src/middleware.ts`. Permissions limited to whatever the assigned role grants.
- `"admin"` — super-admin, the Discord "server owner" equivalent. Bypasses both the customer-route block and the per-permission check. Members of the seeded **Admin** role get this `userType`.

The POST endpoint chooses `userType` from the target role's `name`: invite into the **Admin** role → `userType: "admin"`, anything else → `userType: "staff"`. PATCH re-resolves the same way when `roleId` changes, so demoting an admin to "Ads Manager" flips them to `userType: "staff"` in the same write.

## GET shape

Each entry in `data`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Mongo `_id` |
| `email`, `firstName`, `lastName` | string | |
| `isActive` | boolean | `false` until the invitee completes setup |
| `isEmailVerified` | boolean | Flipped to `true` on setup |
| `userType` | `"staff" \| "admin"` | UI shows a crown / system badge for `admin` |
| `roleId` | string \| null | `null` only briefly during onboarding |
| `roleName` | string \| null | Joined from `Role.name` |
| `roleColor` | string \| null | Joined from `Role.color` (6-digit hex). Drives the avatar color. |
| `inviteStatus` | `"active" \| "pending" \| "expired"` | Derived from `isActive` + `inviteTokenExpires` |
| `invitedAt` | ISO date \| null | |

## Invite flow

1. Admin POSTs `{ email, firstName, lastName, roleId }` to `/api/admin/staff`.
2. Server creates `User({ isActive: false, userType, roleId, inviteToken, inviteTokenExpires: now + 7d })`.
3. SendGrid email goes out with `${NEXTAUTH_URL}/staff-setup/${inviteToken}`.
4. See [docs/auth/](../auth/) for the setup-page flow.

### Re-invite of an inactive FORMER-STAFF account (2026-07-09)

When the email already belongs to an **inactive** account (`isActive: false`) **with staff-workflow history** — a previously-removed staff member (DELETE demotes to customer but retains `invitedAt`/`invitedBy`, and the remove dialog promises re-invitability) or a pending/expired invite (still `userType` staff/admin) — POST **converts it in place** instead of 409ing. An inactive account that was **never** in the staff workflow (a plain admin-deactivated customer, no `invitedAt`) still 409s — their account carries purchase/Stripe history and must not be silently converted by an email typo. The conversion: names are updated from the form, `userType`/`roleId`/legacy `role` are set from the chosen role, a fresh invite token + 7-day TTL is issued, `invitedBy`/`invitedAt` are re-stamped, and `tokenVersion` is bumped (kills any stale session). The account re-enters the normal invite lifecycle; `/staff-setup` sets a fresh password + `isActive: true`. Saved with `validateBeforeSave: false` (same rationale as the DELETE demote — older rows may not satisfy every current schema invariant). Before this, POST rejected **any** existing email, so a removed staffer could never be re-invited.

**Active** accounts still 409: active staff → "A staff account already exists…"; active customers → invites can't convert an active account (staff-setup requires `isActive: false` to activate, and deactivating a live customer pending an email click would lock them out of the site — with the 2026-07-09 login gate they'd be refused login entirely).

## Resend + role change + name edit

`PATCH /api/admin/staff/:id` accepts `{ roleId?, resendInvite?, firstName?, lastName? }`:
- `roleId` updates the assignment immediately, including the `userType` derivation above.
- `resendInvite: true` generates a fresh `inviteToken`, resets the 7-day TTL, and re-sends the invite email. Refuses (`409`) if the user already activated their account.
- `firstName` / `lastName` (1-50 chars, trimmed) edit the display name — pencil icon per row in `StaffManagement.tsx` (gated by `settings.edit`). No `tokenVersion` bump: names carry no authorization, and the jwt callback re-syncs them from the DB on the next request.

## Deletion safeguards

- `403 "Cannot remove yourself"` if `id === session.user.id`.
- Demotion is non-destructive — the underlying `User` document remains so historical references (audit logs, payment events) stay intact. `userType` flips back to `"customer"`, `roleId` is cleared, the account is deactivated, and the invite token is wiped.

## Validation

- Email is lowercased + trimmed via Zod.
- Existing email + already-**active** staff → `409 "A staff account already exists for this email"`.
- Existing email + already-**active** customer → `409` ("Staff invites can't convert an active account").
- Existing email + **inactive** former-staff row (removed staff / stale invite — has `invitedAt` or staff `userType`) → converted and re-invited (see above).
- Existing email + **inactive** never-staff customer → `409` ("can only re-invite former staff").
- `roleId` must be a valid Mongo ObjectId pointing to an existing `Role`.
