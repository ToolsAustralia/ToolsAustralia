# Upsell — Testing

Tests under [src/utils/upsell/__tests__/](../../src/utils/upsell/__tests__/).

> _TODO: enumerate exact files and matching `npm run test:*` scripts._

## Manual smoke

- Cancel a sub → cancel-upsell modal appears (if eligible)
- Accept → Payment Intent flow → success page
- Verify upsell entries in `BenefitsGranted.data.grants`
- Verify image manifest fresh after adding a new image
