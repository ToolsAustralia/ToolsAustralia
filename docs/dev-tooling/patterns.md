# Dev Tooling — Patterns

## P1. Env-gated route handlers

```ts
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("not found", { status: 404 });
  }
  // dev-only logic
}
```

## P2. Test scripts mutate dev DB

Scenario scripts (`scripts/test-*.ts`) write to your local DB to set up specific timing scenarios. Don't run them against staging / prod — they'll corrupt data.

## P3. Idempotent fix scripts

```ts
const alreadyFixed = await checkSentinel();
if (alreadyFixed) {
  console.log("Already fixed; skipping");
  process.exit(0);
}
// fix
await markSentinel();
```

## P4. Examples are reference, not imports

`src/examples/` is for documentation / copy-paste. Don't import from feature code.
