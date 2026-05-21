# Dashboard-Account — API

This domain mostly composes feature-domain APIs:
- [subscription/api.md](../subscription/api.md)
- [payment/api.md](../payment/api.md)
- [draws/api.md](../draws/api.md)
- [rewards-redeemables/api.md](../rewards-redeemables/api.md)
- [billing-stripe/api.md](../billing-stripe/api.md) (saved-PM management)

## `GET /api/users/[id]/my-account`

The single account-page serializer. Owned by [src/app/api/users/[id]/my-account/route.ts](../../src/app/api/users/[id]/my-account/route.ts). Session-gated; non-admins can only fetch their own id.

Response shape (relevant fields):

```jsonc
{
  "success": true,
  "data": {
    "user": {
      // ...userData (stripped of password, tokens),
      "subscriptionPackageData": { /* effective benefits, or null */ },
      "enrichedOneTimePackages": [ { "packageId": "...", "isActive": true, "packageData": { /*...*/ } } ],
      "hasCurrentDrawMembershipGrant": false
    },
    "activeMiniDraws": [ /*...*/ ],
    "recentOrders":     [ /*...*/ ],
    "insights":         { "totalSpent": 0, "activeDrawsCount": 0, "memberSince": 0, "membershipTier": "Bronze" }
  }
}
```

### `user.hasCurrentDrawMembershipGrant` (Phase 2, 2026-05-20)

`boolean` — `true` when a membership grant (renewal or initial) has already been credited to this user in the active major-draw period. Computed in parallel with the mini-draw and recent-order queries via `hasMembershipGrantInCurrentDrawPeriod(userData._id)` ([src/utils/draws/has-membership-grant-this-draw.ts](../../src/utils/draws/has-membership-grant-this-draw.ts)). Fails open to `false` on any error.

Consumed by the four upgrade-preview call sites under [`SubscriptionManagementModal`](../subscription/frontend.md#upgrade-preview-parity-with-the-webhook-phase-2-2026-05-20) and passed as the 4th argument to `calculateUpgradeEntries` so the previewed entry total matches what the webhook will grant (Mode A vs Mode B — see [subscription/rules.md → R3a](../subscription/rules.md#r3a-upgrade-entries-stack-lastmonthaccumulated-unless-a-membership-grant-already-landed-this-draw)).

**Stale-payload caveat.** The flag is a snapshot at fetch time. If a renewal lands between page load and the user clicking "Upgrade," the preview can drift by one mode. The webhook remains the source of truth; refreshing the dashboard re-fetches the flag.

Response carries `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` to keep this snapshot off any intermediate caches.
