# Contact — Models

## `ContactSubmission`

[src/models/ContactSubmission.ts](../../src/models/ContactSubmission.ts) — one row per submission.

> _TODO: pull schema (likely fields: name, email, message, submittedAt, ipAddress?, status?)._

Email validation (2026-07-22): the model's email field uses the shared permissive pattern `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` (plus-addressing and modern TLDs accepted; aligned across User/Affiliate/ContactSubmission/PartnerApplication in the same change).
