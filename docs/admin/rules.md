# Admin — Rules

## R1. Handler-level admin auth

Every `/api/admin/**` handler MUST call `requireAdmin(session)`. Middleware doesn't gate `/api/`. Skipping the check = security vulnerability.

## R2. Audit trails

Admin actions that change state (cancel, charge, refund, edit) must write an audit row:
- Subscription cancel → `MembershipStatusHistory` (actor: "admin", source: "cancel_api_admin")
- Charge past-due → `InvoiceChargeLog` (with `adminId`)
- Refund replay → `RefundProcessed` (data marks the admin actor)

## R3. Sanitised responses

Don't echo raw Stripe/PaymentMethod objects to admin UI. Sanitise per [billing-stripe R11](../billing-stripe/rules.md#r11-sanitise-stripe-responses-before-persisting).

## R4. Confirmation gates for destructive actions

Bulk past-due charge requires typing `CHARGE` exactly. Apply the same pattern for any new bulk-destructive admin tool.

## R5. Mandatory QA review

`.cursor/rules/orchestrator.mdc` requires QA review for admin/payment changes. Flag in PR.

## R6. Cobber transcripts are gated by `submissions.view`, not `overview.view`

The Chatbot tab is granted by `overview.view`, which is correct for the aggregate cost/usage
numbers it originally held. The **Conversations** sub-view is different in kind: it returns what
individual customers typed. It is therefore gated by **`submissions.view`** — the existing
support-facing permission, and where an escalated Cobber chat already lands.

Three places must stay in lockstep; changing one alone either 403s a legitimate user or silently
widens access:

1. `requirePermission("submissions.view")` in `src/app/api/admin/chatbot-conversations/route.ts`
2. the same call in `src/app/api/admin/chatbot-conversations/[id]/route.ts`
3. `usePermissions().has("submissions.view")` in `src/components/admin/ChatbotManagement.tsx`,
   which hides the sub-view switch entirely rather than letting a user click into a 403.

**PII boundary:** the transcript projection returns `firstName` + the opaque `userId` only (the
Norm rule), and message content is already redacted at write time. Do not widen either.

**Norm mirror — deliberately NOT wired.** `GET /api/admin/chatbot-conversations` is a new admin
read, so CLAUDE.md rule 10 applies. It is intentionally left unmirrored: the payload is customer
free-text, which is the one shape the Norm PII boundary (`firstName` + opaque id, no free-text
customer content) exists to keep out. Revisit only with an explicit decision about redaction, not
by default.
