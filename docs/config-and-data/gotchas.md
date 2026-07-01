# Config & Data — Gotchas

## Sample data leaking to prod

`sampleProducts.ts` etc. are fixtures. If a production code path references them as a fallback (e.g. "if Mongo is down, use sample data"), real users see fake products. Audit fallback paths.

## Package config dual-source drift

`membershipPackages.ts` (code) AND `MembershipPackage` (Mongo) — both must be updated when adding a package. Drift = UI shows different prices than Stripe charges, or unknown package errors.

## Constants vs config confusion

Z-index in `constants/`? Yes (never changes mid-runtime). Feature flag in `config/`? Yes (might change between environments). Mixing them up = confusing imports.

## Tree-shaking on client

Importing one constant from `data/index.ts` may pull in the whole barrel file. Verify your bundle if data files grow large.

## Legal copy review

If you change a constant in `legal.ts`, legal team must review before merge. Treat as a special category.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).
