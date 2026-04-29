# Admin — Models

_N/A — admin reads/writes models from other domains. Audit-style writes go through:_

- `MembershipStatusHistory` ([subscription](../subscription/))
- `InvoiceChargeLog` ([billing-stripe](../billing-stripe/))
- `PaymentEvent` (RefundProcessed type) ([billing-stripe](../billing-stripe/))
- `ErrorReport` ([error-reporting](../error-reporting/))
