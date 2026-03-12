# Cancelled Membership Comeback Promo

This document explains how to create and use the shared comeback promo link for cancelled members, including abuse controls and operational guidance.

## What this campaign is

- Campaign type: `cancelled-membership-comeback`
- Audience: `cancelled-members`
- Intended channel: Klaviyo cancellation win-back emails
- One-time use policy: once per user account (enforced via `usedBy`)

## How to create it (Admin)

1. Open Promo Link management.
2. Create a new promo link.
3. Set:
   - **Campaign Type** = `Cancelled Membership Comeback`
   - **Eligibility Audience** = `Cancelled Members` (auto-locked for comeback type)
   - **Require no active subscription** = enabled (recommended default)
   - **Cancelled within days** = optional (e.g. `90`)
   - **Apply to package types** = membership and/or one-time (as needed)
4. Copy the generated promo URL and place it in the Klaviyo email CTA.

## Server-side abuse protections

- Promo validation endpoint is rate-limited.
- Code format is validated before DB lookup.
- Redemption logic is fail-closed (no bonus on update failures).
- Redemption uses atomic update checks:
  - active status
  - not expired
  - package applicability
  - not already used by this user
- Comeback audience eligibility is verified at redemption:
  - cancellation signal present
  - optional inactive-subscription requirement
  - optional cancellation age window

## Shared-code caveats

Shared links are easier to distribute externally. Abuse is limited by per-user one-time redemption and audience checks, but this is still weaker than unique-per-user links.

For highest control, migrate future win-back flows to unique, per-user promo codes.

## Rotation policy (recommended)

- Set expiry (e.g. 30-90 days).
- Rotate code per campaign batch.
- Deactivate old campaigns after send windows close.
- Monitor `usageCount` and unexpected redemption spikes.

## Verification checklist

- Non-cancelled user: promo bonus is not granted.
- Cancelled user: first qualifying purchase grants bonus.
- Same user: second purchase with same promo grants no bonus.
- Inactive/expired campaign: no bonus granted.
- Existing general promos continue to behave as before.
