# Referrals — Patterns

## P1. Event-sourced log

`ReferralEvent` is append-only. Each meaningful action (signup attributed, first payment, bonus issued) is a row. Aggregations derive from the log.

## P2. First-touch attribution

Same as [affiliate P1](../affiliate/patterns.md). The first valid referral seen is sticky for the user's lifetime.

## P3. Bonuses delegated to existing systems

Don't reinvent bonus delivery. Refer entries to [draws](../draws/), promo grants to [promo](../promo/) / [rewards-redeemables](../rewards-redeemables/). Referrals just decides "yes, bonus" and which target system to invoke.
