# Dev Tooling — Gotchas

## Dev routes leaking to prod

Most common bug: forgetting the `NODE_ENV === "production"` early return. Test by setting NODE_ENV=production locally and trying to hit the route.

## Test scripts vs unit tests

`scripts/test-*` is NOT the test suite. It's manual scenario setup. The test suite is `src/**/__tests__/*.test.ts` invoked via `npm run test:*`.

## Bundle leaks

If a feature component imports `src/components/dev/Foo`, the dev component ships in production bundle. Tree-shaking should drop unreferenced code, but a stale import stays. Audit imports periodically.

## Fix-script side effects

`scripts/fix-database-once.mjs` style files are one-shot. If you run them twice without an idempotent guard, they may double-apply. Always read the script before running.

## `console.log` confusion

Dev tooling can use `console.log` freely (stripped in prod). Production code must use `console.error` for error logs. Mixing the two leads to surprise: "why isn't my log appearing in prod?" — because it's `console.log`.

## Playwright MCP (`.mcp.json`, added 2026-07-22)

`@playwright/mcp` is registered PROJECT-scoped in `.mcp.json` (root) so every Claude Code
session in this repo — any developer, any worktree after merge — can drive a live browser
interactively: spec authoring (live DOM/selector discovery instead of throwaway probe
scripts), conversational QA sessions, and visual bug reproduction. Windows note: the
`cmd /c npx` wrapper is REQUIRED — bare `npx` stdio servers fail to spawn on win32.

Pair it with the e2e harness, not your real dev data: `npm run e2e:env` boots the wiped-
and-seeded stack (tracking neutered, Stripe test keys) and holds it open — point the MCP
browser at the printed localhost URL. New MCP servers load at session START; a session
running when `.mcp.json` changed must restart to see it.

## Contentsquare MCP (`.mcp.json`, added 2026-08-07)

Second server alongside `playwright`, registered PROJECT-scoped as an HTTP transport:

```json
"contentsquare": { "type": "http", "url": "https://api.contentsquare.com/mcp" }
```

Equivalent CLI form: `claude mcp add contentsquare --transport http https://api.contentsquare.com/mcp`.

This is Contentsquare's official remote MCP server. It lets an AI agent query Contentsquare
data — heatmaps, session journeys, funnels, surveys, errors — without opening the
Contentsquare UI.

**It cannot be authorized in a non-interactive session.** Auth is OAuth2, browser-based on
first connection, after which the agent refreshes the hourly access tokens automatically. So
the first connection needs an interactive `/mcp` run (or `claude mcp`) to complete the OAuth
flow — until that happens, every tool call fails. A headless/piped session cannot bootstrap it.

Users only see the projects they already have permission for: existing Contentsquare RBAC
carries over, the MCP server grants nothing extra.

Contentsquare's Free tier includes 300 tool calls/month, so this keeps working after the paid
trial ends.

## Debug routes reported a permanently-true `hasPendingChange` (2026-08-26)

`/api/debug/subscription-status`, `/api/debug/clear-pending-change` and
`/api/debug/test-downgrade-flow` each reported `!!user.subscription?.pendingChange`.

`subscription.pendingChange` is a Mongoose **nested object** with all-optional sub-fields, so
Mongoose materialises it as `{}` and `!!{}` is `true`. These routes therefore told anyone
debugging that every user had a pending change — including anyone debugging *that very bug*.
Zero production users actually have one.

All three now use the shared
[`isValidPendingUpgrade`](src/utils/subscription/pending-upgrade.ts), which checks the payload
rather than the object's existence. Same root cause as the Klaviyo
`subscription_has_pending_upgrade` fix; see `docs/subscription/models.md`.
