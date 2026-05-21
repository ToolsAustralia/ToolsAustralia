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
