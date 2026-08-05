# Theme domain

Light/dark theming. **Dark is the hard default** (since 2026-08-05) — the theme only changes when the user
taps the light/dark toggle, and that choice persists. There is **no** time-of-day or
system-preference auto mode. Plus admin theme overrides + promo-driven theme overrides.

## Index

- [architecture.md](./architecture.md) — three contexts, store layer
- [frontend.md](./frontend.md) — components, hooks
- [backend.md](./backend.md) — _N/A — pure client-state_
- [api.md](./api.md) — _N/A_
- [rules.md](./rules.md) — bootstrap on first paint, no flash, dark default
- [patterns.md](./patterns.md) — dark default + persisted manual toggle
- [gotchas.md](./gotchas.md) — legacy auto-dark migration, promo/admin drift
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — manual smoke
