# Client State — Testing

## `npm run test:session-invalidation`

[src/lib/__tests__/session-invalidation.test.ts](../../src/lib/__tests__/session-invalidation.test.ts) —
regression test for `shouldInvalidateSession()` in [src/lib/queries.ts](../../src/lib/queries.ts): only
**401** and **404 + `USER_NOT_FOUND`** may force-sign-out; **403 must never** (a staff role with partial
permissions routinely 403s — treating that as an auth failure auto-logged staff out seconds after login).

## Manual smoke

- Trigger multiple modals simultaneously → verify priority ordering
- Navigate and back → verify TanStack Query cache hits
- Hover link → verify prefetch fires
- Toggle theme → verify no mismatch warning in console
