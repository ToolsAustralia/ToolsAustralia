# Affiliate — Testing

Tests under [src/utils/affiliate/__tests__/](../../src/utils/affiliate/__tests__/).

> _TODO: enumerate exact test files and matching `npm run test:*` scripts._

## Manual smoke

- Visit a `?aff=<code>` URL → verify cookie set
- Sign up → verify `User.affiliate` field populated
- Pay → verify `AffiliateCommission` row created
- Renewal cycle → verify next `AffiliateCommission` row created
- Refund → verify commission marked reversed
