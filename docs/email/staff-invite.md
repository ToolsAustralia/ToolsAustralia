# Staff invite email

`src/lib/email/staff-invite.ts` reads `staff-invite-email-template.html` (repo root) and sends it via the existing `SendGridClient` singleton, using the `EmailCategory.TRANSACTIONAL` sender identity.

## Placeholders

| Placeholder | Filled by |
|---|---|
| `{{INVITEE_NAME}}` | Invitee's first name (HTML-escaped) |
| `{{ROLE_NAME}}` | The Role they were invited into (HTML-escaped) |
| `{{INVITE_LINK}}` | `${NEXTAUTH_URL}/staff-setup/<inviteToken>` (raw, not escaped — must be a valid URL) |
| `{{INVITER_NAME}}` | Full name of the admin who created the invite (HTML-escaped) |
| `{{EXPIRES_IN}}` | Human-readable duration, defaults to `"7 days"` |

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

The HTML template uses the brand red gradient (`#ee0000` → `#ff4444`) and matches the card-style layout of the existing transactional templates (`renewal-failed-email-template.html`, `subscription-payment-failed-email-template.html`). Inline styles are duplicated alongside the `<style>` block for Gmail / Outlook compatibility.
