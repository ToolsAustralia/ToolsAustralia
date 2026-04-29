# Dev Tooling — Rules

## R1. Dev routes must be env-gated

Every `/api/dev/`, `/api/test/`, `/api/test-db/` handler MUST early-return 404 in production:

```ts
if (process.env.NODE_ENV === "production") {
  return new Response("not found", { status: 404 });
}
```

OR be admin-gated. Otherwise dev helpers leak to prod = security incident.

## R2. Don't import dev helpers from prod paths

Files under `src/components/dev/`, `src/examples/`, etc. must NOT be imported from production-path code. Bundler should ideally strip them; verify the bundle.

## R3. `console.log` in dev tooling is OK

Per CLAUDE.md, `console.log/info/debug/warn` are stripped in production builds. Dev tooling can use them freely — they vanish in prod.

## R4. Ops fix scripts should self-disable

`scripts/fix-*` should have an idempotent guard: detect if the fix was already applied and skip. Otherwise re-running can cause damage.

## R5. Don't commit secrets in test scripts

Test scripts are version-controlled. Don't hardcode API keys / tokens — use env vars.
