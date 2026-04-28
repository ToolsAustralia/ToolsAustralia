# Client State — Frontend

This domain IS frontend (no backend surface).

See [architecture.md](./architecture.md) for the full layout: TanStack Query, Zustand stores, Contexts, generic hooks.

## When to use which

- **Server data** (anything from API) → TanStack Query
- **Cross-cutting client state** (theme, modal priority) → Zustand
- **Scoped client state** (sidebar open, current cart) → Context
- **Per-component derived state** → useState / useReducer

Don't mix. Common mistake: mirroring server-state into Zustand. Don't.
