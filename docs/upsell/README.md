# Upsell domain

Post-cancel and in-flow upsell offerings. Cancellation-upsell modal, upsell-success page, upsell image selection, generated image manifest.

## Index

- [architecture.md](./architecture.md) — flow, image manifest, multiplier integration
- [frontend.md](./frontend.md) — upsell-success page, components/upload
- [backend.md](./backend.md) — utils/upsell helpers, image selector, original PM
- [api.md](./api.md) — `/api/upsell/`, `/api/cancellation-upsell/`
- [rules.md](./rules.md) — eligibility, image-manifest must-be-fresh
- [patterns.md](./patterns.md) — image manifest generation, original-PM reuse
- [gotchas.md](./gotchas.md) — image selector edge cases, manifest staleness
- [models.md](./models.md) — _N/A — uses [billing-stripe](../billing-stripe/) PaymentEvent for grants_
- [testing.md](./testing.md) — `__tests__/` under utils/upsell

## Migrated from `docs/UPSELL_IMAGE_SELECTOR.md`

> _TODO: read root file and merge into architecture.md / gotchas.md._
