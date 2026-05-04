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
