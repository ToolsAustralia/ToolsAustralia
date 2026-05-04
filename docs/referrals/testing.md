# Referrals — Testing

> _TODO: enumerate any test files under `src/lib/__tests__/` or referral-specific tests._

## Manual smoke

- Visit `?ref=<code>` URL → cookie set
- Sign up → `User.referredBy` populated, `ReferralEvent` row written
- First payment → bonus issued (verify in `BenefitsGranted.data.grants` or `RedeemableIssuance`)
- Visit a different referral after signup → previous attribution preserved
