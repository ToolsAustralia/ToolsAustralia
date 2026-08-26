# Config & Data — Backend

Read by server code: webhooks, services, route handlers.

For example, the subscription cancel service references `membershipPackages` to look up package details for analytics. The Stripe webhook references `prizes` config when processing milestone-based grants.

When changing static config, ensure all consumers see the change at deploy time.

## `bonusCodes.ts` — trigger → campaign-code map (2026-08-25)

[src/config/bonusCodes.ts](../../src/config/bonusCodes.ts) exports one record:

```ts
export const BONUS_CODE_BY_TRIGGER: Record<BonusCodeTrigger, string> = {
  "cancel-click": "BACKIN200",
  "checkout-start": "LOCKIN100",
  "one-time-purchase": "EXTRA100",
};
```

It exists so the three campaign codes are named in **exactly one place**; no wiring site spells a code literal.
The key type is `BonusCodeTrigger` from
[src/utils/redeemables/bonus-code-policy.ts](../../src/utils/redeemables/bonus-code-policy.ts) — imported, never
re-declared, so adding a trigger there is a compile error here until the map is completed.

A value here is only a **lookup key**. `CampaignService.ensureCampaignIssuanceForUser` resolves it against
`MonthlyEntryCampaign`; with no active campaign carrying the code the call returns `not_applicable` and every
wired path is inert. Nothing in this file creates a campaign — codes are provisioned in the admin monthly-coupon
panel. **One consumer since 2026-08-26**: `mintBonusCodeForTrigger`, behind the Klaviyo bonus-code webhook
(`POST /api/bonus-codes/v1/issue`). The three former consumers — the cancel service, `grantBenefits` and the
guest-registration helper — no longer mint and no longer read this map. See
[rewards-redeemables P7](../rewards-redeemables/patterns.md).

The file's own JSDoc header was still describing the deleted three-call-site model until fix round 1
of the webhook rework (2026-08-26) — it now names `mintBonusCodeForTrigger` as the sole reader, so
the comment an engineer reads first and this row agree. If a fourth trigger is ever added, the only
wiring to change is the webhook path; there is no in-app mint site to update.
