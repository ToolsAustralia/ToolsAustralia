---
description: Add a TanStack Query hook under src/hooks/queries/. Wires query keys, cache invalidation, and the consuming domain doc.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <hook description, e.g. "useFooQuery for /api/foo">
---

# /hook — Add a TanStack Query hook

You are adding a query hook for: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "Which endpoint, what shape (query / mutation), and what domain does it belong to?" and wait.

Invoke the `adding-tanstack-query-hook` skill and follow it exactly. That skill is the source of truth for: file naming (`use<Domain>Queries.ts`), the `queryKeys` central registry, the `apiGet`/`apiPost` wrappers, and the index barrel rule.

## Repo-specific reminders

- Never call `fetch` or build URLs manually inside a hook. Always use `apiGet` / `apiPost` / `apiPatch` / `apiDelete` from `src/lib/queries.ts`.
- Query keys live **only** in `src/lib/queryKeys.ts`. Never inline string arrays.
- Mutations must `invalidateQueries` for every key whose data depends on the mutation.
- `src/hooks/queries/**` is owned by the `client-state` domain in the manifest. **Also** update `docs/<consuming-domain>/` (whichever domain the hook serves) so the doc references the hook.

## Definition of done

- New hook in the correct `src/hooks/queries/use<Domain>Queries.ts` file
- Query key added to `src/lib/queryKeys.ts`
- Response types exported from the hook file
- `docs/client-state/` refreshed AND `docs/<consuming-domain>/` references the new hook
- Tell the user "Implementation in place — run `/ship` to verify."

## STOP — hard rule

Don't commit. Don't push.
