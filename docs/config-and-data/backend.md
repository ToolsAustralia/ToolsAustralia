# Config & Data — Backend

Read by server code: webhooks, services, route handlers.

For example, the subscription cancel service references `membershipPackages` to look up package details for analytics. The Stripe webhook references `prizes` config when processing milestone-based grants.

When changing static config, ensure all consumers see the change at deploy time.
