# Client State — Testing

> _TODO: any tests for stores / hooks under `__tests__/` or `*.test.ts`._

## Manual smoke

- Trigger multiple modals simultaneously → verify priority ordering
- Navigate and back → verify TanStack Query cache hits
- Hover link → verify prefetch fires
- Toggle theme → verify no mismatch warning in console
