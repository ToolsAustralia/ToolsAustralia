# Dashboard-Account — Patterns

## P1. Consumer view, not feature owner

This domain is a top-level consumer. Don't add business logic — extend the feature domains and consume here.

## P2. Landing orchestration

`useDashboardLandingOrchestration` centralises decisions about which landing experience to show. Consumers ask "should I show landing?" and the hook answers based on session storage, user state, and feature-flag config.

## P3. Per-section composition

Each my-account section is a self-contained component that consumes its source-domain hook and renders. Pages compose sections; sections own their data fetching.
