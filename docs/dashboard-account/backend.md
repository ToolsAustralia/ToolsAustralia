# Dashboard-Account — Backend

This domain owns a single dedicated server-side surface — the account-page serializer — and otherwise consumes the feature-domain APIs.

## `GET /api/users/[id]/my-account`

The page-load composite that bundles user, subscription package data, one-time packages, active mini-draws, recent orders, and insights into one response. See [api.md → GET /api/users/[id]/my-account](./api.md#get-apiusersidmy-account) for the shape.

The Phase 2 (2026-05-20) change added `user.hasCurrentDrawMembershipGrant: boolean` to the `user` block. It's resolved in parallel with the existing mini-draw and order queries by calling `hasMembershipGrantInCurrentDrawPeriod(userData._id)` ([src/utils/draws/has-membership-grant-this-draw.ts](../../src/utils/draws/has-membership-grant-this-draw.ts)) inside the route's `Promise.all`. The flag fails open to `false` on any error.

The flag is consumed by the four upgrade-preview call sites in `SubscriptionManagementModal` (see [subscription/frontend.md → Upgrade preview parity](../subscription/frontend.md#upgrade-preview-parity-with-the-webhook-phase-2-2026-05-20)) so the preview's Mode A vs Mode B selection matches the webhook's eventual grant.

## Feature-domain APIs consumed

- [subscription](../subscription/) APIs
- [payment](../payment/) APIs
- [draws](../draws/) APIs
- [rewards-redeemables](../rewards-redeemables/) APIs
- [metrics-analytics](../metrics-analytics/) APIs

All feature business logic lives in those domains; this route only composes.
