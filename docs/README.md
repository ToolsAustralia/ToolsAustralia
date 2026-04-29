# Tools Australia — Codebase Documentation

This folder contains per-domain documentation for the entire codebase. Each domain has its own subfolder with a standardized structure (`README.md`, `architecture.md`, `frontend.md`, `backend.md`, `api.md`, `rules.md`, `patterns.md`, `gotchas.md`, `models.md`, `testing.md` — some marked N/A where they don't apply).

The **Domain Manifest** in [CLAUDE.md](../CLAUDE.md) is the source of truth for which source files belong to which domain. Both the [/doc-sync hook](../.claude/hooks/doc-sync.mjs) and the [/doc-bootstrap](../.claude/commands/doc-bootstrap.md) and [/doc-domain](../.claude/commands/doc-domain.md) slash commands read it.

## 28 domains

### Business / feature (17)

| Domain | Description |
|---|---|
| [subscription](./subscription/) | Membership lifecycle: signup, renewal, cancellation, recovery |
| [billing-stripe](./billing-stripe/) | Stripe webhook, payment events ledger, billing helpers |
| [payment](./payment/) | Payment Intents, Setup Intents, saved cards, 3DS |
| [draws](./draws/) | Major Draw + Mini Draws, tickets, eligibility, winners |
| [rewards-redeemables](./rewards-redeemables/) | Wallet-based redeemables + milestone progression |
| [promo](./promo/) | Promo codes, banners, scheduled promos, multipliers, comeback |
| [affiliate](./affiliate/) | Partner referrals, commissions, payouts |
| [referrals](./referrals/) | Member-to-member referrals |
| [partner](./partner/) | Partner brand discounts, queue lifecycle |
| [upsell](./upsell/) | Cancellation upsell, image manifest |
| [cart-shop-products](./cart-shop-products/) | Shop, cart, checkout, orders |
| [error-reporting](./error-reporting/) | Centralised ErrorReport system |
| [auth](./auth/) | NextAuth (email + Google), JWT, password reset |
| [email](./email/) | SendGrid transactional, templates at root |
| [tracking](./tracking/) | Facebook/Meta CAPI, GTM, Klaviyo, TikTok, UTM |
| [ab-testing](./ab-testing/) | A/B testing infrastructure with dedup + DB optimisation |
| [metrics-analytics](./metrics-analytics/) | Member metrics dashboard, daily aggregations |
| [contact](./contact/) | Public contact form |

### UI / client-side (3)

| Domain | Description |
|---|---|
| [theme](./theme/) | Light/dark/auto theming, schedule-based switching |
| [shared-ui](./shared-ui/) | Design system primitives (ui, cards, cta, layout, modals, etc.) |
| [client-state](./client-state/) | TanStack Query + Zustand + Context patterns |

### Cross-cutting / infra (8)

| Domain | Description |
|---|---|
| [admin](./admin/) | Admin panel + `/api/admin/**` |
| [dashboard-account](./dashboard-account/) | `/my-account/` member view |
| [security-csp](./security-csp/) | CSP, middleware, rate limiting |
| [mongodb](./mongodb/) | Connection, repositories, jobs |
| [infrastructure](./infrastructure/) | Health, cron, upload, env, Zod, dates |
| [dev-tooling](./dev-tooling/) | Dev routes, debug, examples, test scripts |
| [config-and-data](./config-and-data/) | Static config, constants, seed data |

## How docs stay in sync with code

A **doc-sync hook** at [.claude/hooks/doc-sync.mjs](../.claude/hooks/doc-sync.mjs) runs at the end of every Claude Code session. If you edited code in `src/` or `scripts/` but didn't update the matching `docs/<domain>/`, the hook blocks the Stop and tells you exactly which doc to update.

The Domain Manifest in [CLAUDE.md](../CLAUDE.md) is the file→domain map. Both Claude and the hook read the same JSON block.

## How to use these docs

- **Starting work in an unfamiliar area?** Read the domain's `README.md` + `architecture.md`.
- **Editing an API route?** Check `api.md` for the route inventory.
- **Adding a new feature?** Read `rules.md` and `patterns.md` first.
- **Hit a bug?** Check `gotchas.md` for known sharp edges.

## Slash commands

- `/doc-bootstrap` — generate all 28 domain docs from scratch (one-time)
- `/doc-domain <name>` — refresh or scaffold a single domain
- `/doc-sync` — manual coverage audit (orphans, ghosts)

## Refresh status

Each domain has a `lastVerified` date in the Domain Manifest. The doc-sync hook bumps this when you update a domain's docs. Stale dates indicate domains that need a refresh pass.

## Pending refresh items

Many docs include `_TODO: read root file and merge_` markers — the bootstrap pass identified content from existing root-level docs (`docs/*.md`, `src/docs/*.md`) that should be merged into the new structure. A subsequent `/doc-domain <name>` refresh pass will absorb these.

Until refresh: original root-level `.md` files are preserved as the authoritative source for those `TODO` sections.

## Spec & plan

The system itself is documented at:
- [Spec](./superpowers/specs/2026-04-28-codebase-documentation-system-design.md)
- [Plan](./superpowers/plans/2026-04-28-codebase-documentation-system.md)
