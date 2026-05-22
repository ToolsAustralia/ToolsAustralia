# Staff API

Manages the internal user roster (`userType` in `{"staff", "admin"}`). All endpoints live under `/api/admin/staff/**`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/staff` | `settings.view` | Lists every internal user with role + invite status |
| POST | `/api/admin/staff` | `settings.edit` | Creates an inactive `User`, sends a SendGrid invite |
| PATCH | `/api/admin/staff/:id` | `settings.edit` | Change role and/or resend invite |
| DELETE | `/api/admin/staff/:id` | `settings.edit` | Demotes the user to `userType: "customer"` and deactivates |

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

## Resend + role change

`PATCH /api/admin/staff/:id` accepts `{ roleId? , resendInvite? }`:
- `roleId` updates the assignment immediately, including the `userType` derivation above.
- `resendInvite: true` generates a fresh `inviteToken`, resets the 7-day TTL, and re-sends the invite email. Refuses (`409`) if the user already activated their account.

## Deletion safeguards

- `403 "Cannot remove yourself"` if `id === session.user.id`.
- Demotion is non-destructive — the underlying `User` document remains so historical references (audit logs, payment events) stay intact. `userType` flips back to `"customer"`, `roleId` is cleared, the account is deactivated, and the invite token is wiped.

## Validation

- Email is lowercased + trimmed via Zod.
- Existing email + already-active staff → `409 "A staff account already exists for this email"`.
- Existing email but not staff → `409` with a message asking for a different email (we don't want to silently convert customers).
- `roleId` must be a valid Mongo ObjectId pointing to an existing `Role`.
