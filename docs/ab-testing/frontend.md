# A/B Testing — Frontend

## Components

[src/components/ab-testing/](../../src/components/ab-testing/) — variant rendering wrappers, experiment provider.

## Hooks

[src/hooks/ab-testing/](../../src/hooks/ab-testing/) — read-side variant resolution.

> _TODO: enumerate exact components and hooks._

### useMembershipThemeExperiment()

`src/hooks/ab-testing/useMembershipThemeExperiment.ts`. Returns
`{ forceLight: boolean }` (default false = today's behavior). Discovers the
membership-theme experiment, reuses `POST /api/ab-testing/assign` with the
constant slug `__membership-theme__`, and reports whether the assigned
variant's `membershipTheme.forceLight === true`. SSR-safe; degrades to false
on SSR/loading/error/admin. Consumed only by `MembershipSection`.

## Server-resolved variants

To avoid flicker (showing variant A then snapping to variant B), variants are resolved server-side and the page renders the right variant on first paint. See [rules.md](./rules.md#r1-no-client-side-flicker).
