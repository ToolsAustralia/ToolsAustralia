# Staff invite email

`src/lib/email/staff-invite.ts` builds the invite HTML from `createStaffInviteEmailTemplate()` in `src/lib/email/templates.ts` (shared `components.ts` design system) and sends it via the `SendGridClient` singleton, using the `EmailCategory.TRANSACTIONAL` sender identity.

**Code-as-source (June 2026).** This email used to be a standalone HTML file at `email-templates/sendgrid/staff-invite-email-template.html`, loaded from disk at runtime via `process.cwd()`. That folder is gone — staff-invite is now rendered from code like every other SendGrid email, so it inherits header/footer/design-system changes automatically and no longer depends on Next file-tracing the HTML into the serverless bundle.

## Parameters (`createStaffInviteEmailTemplate` / `sendStaffInviteEmail`)

| Param | Filled by |
|---|---|
| `inviteeName` | Invitee's first name (HTML-escaped in the template) |
| `roleName` | The Role they were invited into (HTML-escaped) |
| `inviteLink` | `${NEXTAUTH_URL}/staff-setup/<inviteToken>` (raw, not escaped — must be a valid URL) |
| `inviterName` | Full name of the admin who created the invite (HTML-escaped) |
| `expiresIn` | Human-readable duration, defaults to `"7 days"` |

## Usage

```ts
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

await sendStaffInviteEmail({
  to: "new@example.com",
  inviteeName: "Maya",
  roleName: "Ads Manager",
  inviteLink: `${process.env.NEXTAUTH_URL}/staff-setup/${token}`,
  inviterName: "DJ Rivera",
});
```

The function returns `EmailResult` — caller can ignore the result for a fire-and-forget send or surface `success === false` for resend retries.

The invite link points at `/staff-setup/<inviteToken>` on whichever host `NEXTAUTH_URL` resolves to. Tokens expire after 7 days (configured in `src/app/api/admin/staff/route.ts`).

Preview it live (sample data) at `/email-preview` → **Staff invite**; `StaffInvitePreview` renders from the same `createStaffInviteEmailTemplate()` the sender uses, so the preview can't drift from production.
