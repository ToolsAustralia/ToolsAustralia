# Rewards System Pause Scope

The rewards experience is temporarily paused across the product. To protect historical data and minimise regression risk, we apply the following scoped behaviour:

- Accrual continues: server-side earn logic still records `user.rewardsPoints` so balances remain accurate for future reinstatement and audit trails.
- User visibility is suppressed: public UI stops showing point totals and instead surfaces a neutral "Rewards are currently unavailable" notice with guidance to contact support.
- Redemption endpoints are disabled: every handler under `src/app/api/rewards` short-circuits when `rewardsEnabled` is `false`, returning HTTP 503 with a consistent payload.
- Admin read-only access stays: internal tooling may continue to fetch balances for support, but any mutation (redeem, adjust) is blocked by the same feature flag.
- Navigation and marketing references are hidden: header/footer links, dashboard cards, and promotional banners stop linking to rewards destinations while the flag is off.
- Analytics and notifications are paused: events specific to rewards earning/redeeming do not fire while the system is disabled to avoid confusing data streams.

Keep this document updated if stakeholder decisions change (e.g., allowing balance visibility or staged rollouts). Update the `rewardsEnabled` flag defaults and messaging copy to match the agreed scope before deployment.
