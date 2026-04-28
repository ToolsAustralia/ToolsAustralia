# Dashboard-Account — Rules

## R1. Auth-gated

`/my-account/**` requires session. Middleware redirects unauthenticated users to `/login`.

## R2. Read-only by default

The dashboard surfaces feature-domain data; mutations (cancel sub, change PM, etc.) go through the feature-domain APIs, not local logic.

## R3. Defer landing experiences

`useDashboardLandingOrchestration` decides whether to show landing-page experiences (e.g. first-visit-after-signup). Don't trigger landing logic from random components.

## R4. No business logic in dashboard pages

If you find yourself computing eligibility / entries / status here, it belongs in the source domain.
