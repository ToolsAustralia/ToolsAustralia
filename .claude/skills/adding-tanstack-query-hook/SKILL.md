---
name: adding-tanstack-query-hook
description: Use when adding a React Query hook, fetching data on the client, building a useXxxQuery / useXxxMutation, wiring a new endpoint to the UI, or adding cache invalidation. Triggers on phrases like "add a query hook", "useQuery for X", "fetch this on the client", "invalidate cache", "tanstack query".
---

# adding-tanstack-query-hook

## When to use
Adding a new client-side data hook in `src/hooks/queries/`, or adding a new query/mutation to an existing one. Components must **not** call `fetch` or `apiGet` directly — they consume hooks. There are 25 existing files in this folder; follow their pattern.

## Steps
1. Pick the file. One file per domain: `src/hooks/queries/use<Domain>Queries.ts` (e.g. `useRedeemablesQueries.ts`, `useSubscriptionQueries.ts`). Add to an existing file if the domain is already there.
2. Add the query key to `src/lib/queryKeys.ts` under the matching top-level group. Keys are hierarchical and `as const`; see the existing groups for shape (`users.detail(id)`, `products.list(filters)`).
3. Inside the queries file, import `useQuery` / `useMutation` / `useQueryClient` from `@tanstack/react-query`, and `apiGet` / `apiPost` / `apiPatch` / `apiDelete` from `@/lib/queries`. **Do not** import `fetch` or build URLs manually.
4. Export a hook `useXxx()` that returns the result of `useQuery({ queryKey: queryKeys.<group>.<entry>, queryFn: () => apiGet<TResponse>("/api/...") })`.
5. For mutations, on `onSuccess` call `queryClient.invalidateQueries({ queryKey: queryKeys.<group>.<entry> })` for every key whose data depends on the mutation.
6. Export the response TypeScript types from the same file (other components will import them — see `RedeemableWalletItem` etc. in `useRedeemablesQueries.ts`).

## Conventions
- Filename: `use<Domain>Queries.ts`, PascalCase domain. Listed in `src/hooks/queries/index.ts` if the file is new.
- Query keys are **always** built from `queryKeys` — never inline string arrays in the hook. Cache invalidation breaks if keys are not centralised.
- `apiGet`/`apiPost` etc. handle session caching and 401 sign-out automatically (`src/lib/queries.ts`). Do not reimplement.
- Prefer `useQuery` for reads, `useMutation` for writes. SWR is also in the repo (`swr` dep) but new code should use TanStack Query unless the surrounding file is already SWR.
- Hooks live in `src/hooks/queries/` (data) — UI-state hooks live directly in `src/hooks/`. Don't mix.
- The whole `src/hooks/queries/**` tree is owned by the `client-state` domain in the Domain Manifest, so a new file there will pass the doc-sync hook against `docs/client-state/`. **Also** update the domain whose data the hook serves (e.g. for `useSubscriptionQueries.ts` update `docs/subscription/api.md` or `docs/subscription/frontend.md` so the consuming domain's doc references the hook).

## Verification
```bash
npm run lint
npm run type-check
npm run dev   # mount the consuming component, confirm network call + cached state
```
For mutation hooks, manually trigger the mutation in the browser and confirm dependent queries refetch. Do not commit; ask the user.
