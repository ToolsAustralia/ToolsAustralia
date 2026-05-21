---
name: writing-tsx-test
description: Use when adding a unit test, writing a test file, asked to "add a test for X", or to verify billing / payment / subscription / redeemable / affiliate / Klaviyo / Facebook CAPI logic. Triggers on phrases like "write a test", "test this function", "add a regression test".
---

# writing-tsx-test

## When to use
Adding any new test under `src/**/__tests__/*.test.ts`. **There is no jest or vitest in this repo** — tests are standalone `tsx` scripts that throw on failure (see `node:assert/strict`).

## Steps
1. Create the test file at `src/<area>/__tests__/<descriptive-name>.test.ts`. Co-locate it with the code under test (e.g. `src/utils/payment/__tests__/refund-reversal.test.ts`).
2. Use `node:assert/strict`. Each test is a plain function; a top-level `run()` calls them and `console.log`s a success line. See `src/services/redeemables/__tests__/redeemables.test.ts` for the canonical shape.
3. **Add a matching `test:<scope>` script in `package.json`** pointing at the file with `tsx`. Without this entry the test is undiscoverable — `npm test` only runs anchor-billing.
4. If the test covers a service/util in two files, chain them with `&&` in the same script (see `test:stripe-collection-pause`).
5. Run the new script and confirm it prints the success line.

## Conventions
- File name pattern: `<topic>.test.ts`, lower-kebab-case, ends in `.test.ts`.
- npm script name pattern: `test:<topic>` matching the file's intent (`test:refund-reversal`, `test:facebook-capi`). Keep consistent with siblings already in `package.json`.
- Tests must be **pure** — no live DB, no Stripe, no network. Mock or hand-construct fixtures. Look at `test:anchor-billing` and `test:redeemables` for the ceiling of acceptable complexity.
- `assert.equal(actual, expected, "message")` — the third arg is required so failures are diagnosable.
- A failing assertion throws and `tsx` exits non-zero — that's the whole reporter. Do not add a framework.
- Touching files in `src/services/`, `src/utils/`, `src/lib/`, or `src/models/` triggers `docs/<domain>/` updates per the manifest.

## Verification
```bash
npm run test:<your-new-scope>   # must print the success line and exit 0
npm run type-check
npm run lint
```
The Stop hook will flag stale docs if the test covers a domain whose docs you didn't touch. Do not commit; hand off to the user.
