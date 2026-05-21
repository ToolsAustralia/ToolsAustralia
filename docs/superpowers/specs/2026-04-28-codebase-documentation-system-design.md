# Codebase Documentation System — Design Spec

**Date:** 2026-04-28
**Author:** DJ (with Claude Code assistance)
**Status:** Approved — ready for implementation

---

## 1. Problem

The repo has ~40 docs at `docs/*.md` covering subsystems (billing, email, A/B testing, etc.) plus a strong `CLAUDE.md`, but:

- Docs are flat — no per-domain grouping. Hard to know "where do all the subscription docs live?"
- No standardized structure within a subsystem (each doc covers different angles).
- Docs drift from code silently. Nothing forces an update when `src/` changes.
- New domains often ship without docs at all.
- Superpowers skills (`executing-plans`, `finishing-a-development-branch`) auto-commit by default, which conflicts with the user's "review before commit" workflow.

## 2. Goals

1. Every domain in the codebase has its own `docs/<domain>/` folder with a standardized doc set.
2. Docs are kept in sync with code **automatically**, not by user discipline.
3. The system is "intelligent" — it knows which docs map to which code, and only nags when there's an actual mismatch.
4. No commits/pushes/PRs happen without explicit user approval, even from superpowers skills.
5. The bootstrap (initial documentation pass) and ongoing maintenance share infrastructure.

## 3. Non-Goals

- Per-file documentation (`foo.ts.md`). Too noisy, rots fast, code itself is the source.
- Auto-generating doc *content* from code analysis (e.g., AST parsing). Claude reads code; that's enough.
- Replacing inline code comments. Docs cover domain-level architecture, not line-level explanations.
- Documenting third-party libraries (Stripe SDK, Mongoose, etc.) — only how *we* use them.

## 4. Architecture

Four components, one source of truth:

```
┌─ CLAUDE.md ─────────────────────────────────────────┐
│ • Hard rules (no auto-commit, update docs on edit)  │
│ • DOMAIN-MANIFEST yaml block (file globs → docs)    │  ← source of truth
└─────────────────────────────────────────────────────┘
              │ read by
   ┌──────────┼──────────┬───────────────┐
   ▼          ▼          ▼               ▼
Stop hook  Slash cmds  Claude itself   /doc-sync (manual audit)
```

- **CLAUDE.md** — single source of truth. Contains both prose rules and a machine-readable manifest.
- **Stop hook** — silent watcher. After every Claude session, checks if touched files have matching doc updates. Blocks Stop if they don't.
- **PreToolUse Bash hook** — pattern-matches `git commit|git add|git push|gh pr create|gh pr merge` and blocks unless user explicitly authorized.
- **Slash commands** — `/doc-bootstrap` (one-time initial pass) and `/doc-domain <name>` (refresh or add a single domain).
- **Optional `/doc-sync` audit** — manual janitor command for catching drift the hook can't (renames done outside Claude, deleted files, etc.).

## 5. Domain Inventory

**28 domains identified.** Each gets a `docs/<domain>/` folder. Goal: every file under `src/` and `scripts/` maps to exactly one domain.

### Business / feature (18)

| Domain | Primary code locations |
|---|---|
| `subscription` | services/subscription/, utils/subscription/, utils/membership/, models (User, MembershipPackage, MembershipRenewalCycle, MembershipStatusHistory, ChargeJobLock), api/subscription/, api/memberships/, hooks (useStripeSubscription, useMemberships, useActivePackage, useMembershipModal) |
| `billing-stripe` | utils/billing/, lib/stripe.ts, lib/stripe-client.ts, models (PaymentEvent, ProcessedStripeEvent, InvoiceChargeLog), api/stripe/, api/invoice/ |
| `payment` | lib/payment/, utils/payment/, components/payment/, api/payment-intent/, api/payment-status/, hooks (usePaymentIntent, useSetupIntent, use3DSRedirectHandler, useSavedPaymentMethods) |
| `draws` | utils/draws/, models (MajorDraw, MiniDraw, TicketEntry, Winner, MonthlyEntryCampaign, SegmentSnapshot), api/major-draw/, api/mini-draw/, api/winners/, app/(site)/{major-draw,mini-draws,mini-draw-success,draw-results,winners}/, utils/giveaway-eligibility.ts, utils/winner-name-formatter.ts, utils/winners.ts, lib/purchaseCooldown.ts |
| `rewards-redeemables` | services/redeemables/, utils/redeemables/, models (RedeemableIssuance, MilestoneIssuance, MilestoneReward), api/redeemables/, api/rewards/, app/(site)/rewards/, lib/rewardsGuard.ts, hooks/usePrizeCatalog.ts, hooks/useEntryRewardToast.ts |
| `promo` | services/promo/, services/promo-analytics/, utils/promo/, utils/promo-analytics/, utils/promo-banner/, models (Promo, PromoLink, ScheduledPromo, AlternatingPromoMultiplier, PromoBannerText, PromoAnalyticsVisit, BonusEntryPromo), api/promo/, api/codes/, app/promotions/, app/(site)/promotion/, components/promo/, components/banners/ (promo banners), hooks (usePromoLink, usePromoPageTracking, usePromoWelcomeModal) |
| `affiliate` | models (Affiliate, AffiliateCommission, AffiliatePayout), lib/affiliate.ts, lib/affiliate-auth.ts, utils/affiliate/, api/affiliate/, app/(site)/affiliate/, hooks (useAffiliateAuth, useAffiliateLink) |
| `referrals` | lib/referral.ts, models/ReferralEvent.ts, api/referrals/, hooks/useReferralCode.ts |
| `partner` | utils/partner-discounts/, models (PartnerApplication, PartnerDiscount), api/partner-applications/, api/partner-discount/, app/(site)/partner/ |
| `upsell` | utils/upsell/, api/upsell/, api/cancellation-upsell/, app/(site)/upsell-success/, components/upload/ (upsell-related), src/generated/upsellImageManifest.ts, scripts/build-upsell-image-manifest.ts |
| `cart-shop-products` | app/(site)/{shop,checkout,purchase-success}/, api/cart/, api/products/, api/orders/, models (Product, Order), contexts/CartContext.tsx, hooks/usePurchaseInvalidation.ts |
| `error-reporting` | services/error-reporting/, utils/error-reporting/, models/ErrorReport.ts, api/error-reports/, api/admin/error-reports/, components/error/, hooks (useErrorHandling, useErrorRecovery), lib/errors/ |
| `auth` | lib/auth.ts, lib/api-auth.ts, lib/jwt.ts, lib/debugAuth.ts, components/auth/, api/auth/, api/user/, api/users/, app/{login,reset-password,oauth-redirect}/, contexts/UserContext.tsx |
| `email` | lib/email/, lib/email.ts, lib/sms.ts, api/newsletter/, app/email-preview/, components/email-preview/, root `*-email-template.html` files |
| `tracking` | components (FacebookPixel, GoogleTagManager, KlaviyoPageTracker, KlaviyoScriptLoader, PixelTracker, TikTokPixel), components/tracking/, lib/facebook.ts, lib/facebook-env.ts, lib/facebook-marketing.ts, lib/gtm.ts, lib/klaviyo.ts, utils/tracking/, utils/integrations/, utils/meta/, services/meta/, models (MetaAdDestination, MetaAdInsightsDaily), api/facebook/, api/tracking/, hooks (useKlaviyoTracking, usePixelTracking, useAttribution, useUTMPersistence), utils/utm/, lib/utm/ |
| `ab-testing` | services/ab-testing/, components/ab-testing/, hooks/ab-testing/, repositories/ab-testing/, api/ab-testing/, models/ab-testing/ |
| `metrics-analytics` | services/metrics/, services/analytics/, utils/metrics/, models/LandingPageMetricsDaily.ts, schemas/metrics/, hooks (useUserMetrics, useDailyUserMetrics, useMetricsFormatting, useUserMajorDrawComparison), utils/dashboard-entry-hold.ts, utils/dashboard-landing-session.ts |
| `contact` | api/contact-submissions/, api/admin/contact-submissions/ (if exists), models/ContactSubmission.ts, app/(site)/contact/ |

### UI / client-side (3)

| Domain | Primary code locations |
|---|---|
| `theme` | components/theme/, hooks (useTheme, useAutoTheme, useThemeToggleWithHold, useHtmlDarkForUi), utils/themeBootstrap.ts, utils/themeSchedule.ts, contexts/ThemeContext.tsx, contexts/AdminThemeContext.tsx, stores/useThemeStore.ts, stores/usePromoThemeStore.ts |
| `shared-ui` | components/{ui,cards,cta,layout,loading,modals,sections,seo,system,filters,banners}/, components/index.ts, utils/{dom,motion,url,common}/, utils/display-name.ts, utils/brand-utils.ts, utils/images/, utils/package-colors.ts, utils/prize-brand-colors.ts |
| `client-state` | contexts/{LoadingContext,SidebarContext,AdminUserModalContext}.tsx, stores/, lib/queries.ts, lib/queryKeys.ts, lib/requestDeduplication.ts, hooks (useDebounce, useMediaQuery, useIsLgUp, useScrollAnimation, useLoadingStates, usePrefetching, useConfetti, hooks/queries/) |

### Cross-cutting / infra (7)

| Domain | Primary code locations |
|---|---|
| `admin` | app/admin/, components/admin/, api/admin/ (catch-all for routes not owned by another domain), features/admin/, server/admin/, hooks/useAdminMobileDateToolbarSlot.ts |
| `dashboard-account` | app/(site)/my-account/, hooks (useDashboardEntryDisplay, useDashboardLandingOrchestration), app/(site)/components/LandingPageTrigger.tsx |
| `security-csp` | src/middleware.ts, src/utils/security/, next.config.ts CSP/headers, lib/rate-limiting/ |
| `mongodb` | src/lib/mongodb.ts, src/utils/database/, connection patterns, src/models/ general conventions, src/repositories/ general patterns, src/lib/jobs/ |
| `infrastructure` | api/health/, api/cron/, api/upload/, api/images/, lib/cloudinary.ts, lib/environment.ts, lib/zod/, utils/dates/, utils/validation/, utils/webhook/, scripts/migrations/, scripts/seed-admin-data.ts, operational scripts (migrate:, backfill:, sync:, stripe:, find:) |
| `dev-tooling` | api/{debug,dev,test,test-db}/, app/{dev,test-pixels}/, components/dev/, examples/, scripts/test-*.ts, scripts/fix-*.{ts,mjs,js} |
| `config-and-data` | src/config/, src/constants/, src/data/, .browserslistrc, postcss.config.mjs (config files at repo root referenced for context only) |

A top-level `docs/README.md` indexes all 28 domains.

### Migration scope: existing markdown to absorb

Beyond the 40 docs at `docs/*.md` (root), there are **6 more docs** at `src/docs/*.md` that must also be migrated:

- `src/docs/ENVIRONMENT_SETUP.md` → `docs/infrastructure/`
- `src/docs/KLAVIYO_INTEGRATION.md` → `docs/tracking/`
- `src/docs/PIXEL_INTEGRATION.md` → `docs/tracking/`
- `src/docs/PIXEL_TESTING_GUIDE.md` → `docs/tracking/testing.md`
- `src/docs/PROMOTION_ANALYTICS.md` → `docs/promo/` (analytics section)
- `src/docs/UTM_ATTRIBUTION.md` → `docs/tracking/`

Plus the Cursor-specific docs (`.cursor/rules/`, `.cursor/agents/*.md`) — these are **not** migrated (they're Cursor tool config, not project docs), but `docs/<domain>/patterns.md` should reference them where relevant.

Plus root-level `TESTING-TIMEZONE-DST.md` → `docs/billing-stripe/testing.md` (DST tests are billing-anchor related).

## 6. Per-Domain Doc Template

Each `docs/<domain>/` folder contains 8 base files + 2 conditional:

| File | Purpose | Created when |
|---|---|---|
| `README.md` | Index, ownership, links to other docs in folder | Always |
| `architecture.md` | Data flow, layers, key entities, diagrams | Always |
| `frontend.md` | Pages, components, hooks, client state | Always (stub if N/A) |
| `backend.md` | Services, repositories, jobs, webhooks | Always (stub if N/A) |
| `api.md` | Routes — method, path, auth, request/response shape, error codes | Always (stub if N/A) |
| `rules.md` | Hard must/must-not constraints | Always |
| `patterns.md` | Recurring code conventions specific to domain | Always |
| `gotchas.md` | Past incidents, surprising behaviors, race conditions | Always |
| `models.md` | Mongo schema docs | Only if domain has Mongo models |
| `testing.md` | Test setup, scripts, coverage notes | Only if domain has tests |

**Stub format** (for N/A files):

```markdown
# frontend.md

_N/A — this domain has no frontend surface. See [architecture.md](./architecture.md)._
```

## 7. DOMAIN-MANIFEST Format

Embedded in `CLAUDE.md` as a fenced YAML block with a parseable header:

```yaml
# DOMAIN-MANIFEST v1
# Source of truth for file→doc mapping. Both Claude and the doc-sync hook read this.
# Edit by hand only when adding/removing a domain. Path globs use minimatch syntax.

domains:
  subscription:
    docs: docs/subscription/
    paths:
      - src/services/subscription/**
      - src/models/User.ts
      - src/models/MembershipPackage.ts
      - src/models/MembershipRenewalCycle.ts
      - src/models/MembershipStatusHistory.ts
      - src/models/ChargeJobLock.ts
      - src/app/api/subscription/**
      - src/hooks/useStripeSubscription.ts
      - src/hooks/useMemberships.ts
      - src/hooks/useActivePackage.ts
    last_verified: 2026-04-28
  # ... 21 more domains
```

The hook parses this block out of `CLAUDE.md` (via the `# DOMAIN-MANIFEST` marker) and uses it for file→domain lookups.

## 8. Auto-Update Flow

```
Claude edits files (Edit/Write/MultiEdit)
       ↓
PostToolUse hook
  appends path to .claude/.touched-files
       ↓
... more edits ...
       ↓
Claude calls Stop
       ↓
Stop hook:
  1. Read .touched-files
  2. Filter trivia (comments-only, formatting, imports)
  3. For each remaining path: look up domain in DOMAIN-MANIFEST
  4. For each affected domain: did docs/<domain>/* also change in this session?
       │
       ├─ YES → bump last_verified=<today>, allow Stop, clear .touched-files
       │
       └─ NO  → block Stop with system-reminder:
                 "These domains have stale docs:
                  - subscription: docs/subscription/api.md, gotchas.md
                  - billing-stripe: docs/billing-stripe/architecture.md
                  Update them before finishing."
                 (Claude updates → retries Stop → passes)
```

### Smart behaviors

- **Trivia filter** — git diff on touched files; if only comments/whitespace/import order changed, skip.
- **New file in unmapped path** — "this looks like a new domain `<x>`. Scaffold `docs/<x>/`?"
- **Rot detection** — if a domain's `last_verified` is >90 days old AND its files have changed >5 times since, flag for fresh review (not a hard block, just a note).
- **Rename detection** — if `git status` shows renames, manifest auto-updates path entries.

## 9. Slash Commands

### `/doc-bootstrap` (one-time)

Sequential, per-domain:

1. Read all files matching the domain's globs.
2. Generate the 8–10 docs (skip-with-stub for N/A files).
3. If matching root `docs/*.md` exists, migrate its content into the new structure (split across architecture/gotchas/etc. as appropriate).
4. Set `last_verified: <today>` in manifest.
5. Stop and ask the user "review and commit `docs/<domain>/`?" — wait for explicit approval.
6. After all 22 domains complete: delete migrated root `docs/*.md` files, generate `docs/README.md` index.

### `/doc-domain <name>` (refresh / add)

- **Existing domain** → re-read code, update each doc surgically (don't overwrite blindly — diff against current state, only edit changed sections).
- **New domain** → scaffold the 8–10 files, prompt user to add manifest entry to CLAUDE.md.
- Always asks before commit.

### `/doc-sync` (optional audit)

- Walks every file under `src/`, verifies it matches exactly one domain in the manifest.
- Reports orphans (files no domain covers) and ghosts (manifest entries pointing to deleted files).
- User runs ad-hoc; not part of normal flow.

## 10. No-Auto-Commit Enforcement

### Prose rule (CLAUDE.md, top section)

Add a `## Hard rules — read first` section:

> **Never run** `git commit`, `git add`, `git push`, `gh pr create`, or `gh pr merge` unless the user **explicitly** says "commit", "push", "make a PR", or similar in their **most recent** message. This overrides any superpowers skill (including `executing-plans`, `finishing-a-development-branch`, `subagent-driven-development`) that suggests committing automatically. When unsure, ask.

### PreToolUse Bash hook

Pattern-matches the above commands. Blocks with: `"User has set no-auto-commit. The user must explicitly authorize this command in their most recent message."`

The hook lets the command through if the latest user message contains a commit-authorizing keyword (`commit`, `push`, `merge`, `make a PR`, `create a PR`).

## 11. File Deliverables (this implementation)

| File | Action | Notes |
|---|---|---|
| `docs/superpowers/specs/2026-04-28-codebase-documentation-system-design.md` | Create | This spec |
| `CLAUDE.md` | Edit | Add `## Hard rules` section + DOMAIN-MANIFEST yaml block at end |
| `.claude/settings.json` | Edit (or create) | Wire up Stop hook + PostToolUse hook + PreToolUse Bash hook |
| `.claude/hooks/doc-sync.sh` | Create | Stop hook script |
| `.claude/hooks/touched-files-track.sh` | Create | PostToolUse tracker |
| `.claude/hooks/no-auto-commit.sh` | Create | PreToolUse Bash blocker |
| `.claude/commands/doc-bootstrap.md` | Create | Bootstrap slash command |
| `.claude/commands/doc-domain.md` | Create | Per-domain refresh command |
| `.claude/commands/doc-sync.md` | Create | Optional audit command |

**Not created in this implementation:** the actual `docs/<domain>/` content. That's generated when the user runs `/doc-bootstrap` in a fresh session — across 28 domains, with user approval between each commit.

## 12. Implementation Order

1. Write spec (this file). ✅
2. Add Hard rules section + DOMAIN-MANIFEST (28 domains) to `CLAUDE.md`.
3. Create the three hook scripts under `.claude/hooks/`.
4. Wire hooks into `.claude/settings.json`.
5. Create the three slash command files under `.claude/commands/`.
6. **Coverage verification step**: run `/doc-sync audit` (dry-mode against the new manifest) to confirm every file under `src/` and `scripts/` matches exactly one domain. Fix any orphans before bootstrap.
7. Smoke test: edit a file in `src/services/subscription/`, verify Stop hook fires correctly and reports `subscription` as the affected domain.
8. Hand off — user runs `/doc-bootstrap` when ready.

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hook is too noisy (false positives on trivial edits) | Trivia filter excludes comment/whitespace/import-only diffs |
| Hook fails / hooks disabled in some env | Prose rule in CLAUDE.md is the floor; `/doc-sync` audit catches drift later |
| User edits files outside Claude (in IDE directly) | `/doc-sync audit` finds drift; rot detector flags stale domains automatically next session |
| Manifest grows unwieldy as repo grows | YAML format supports glob patterns; one entry per domain, not per file |
| Bootstrap takes hours and many commits | User explicitly accepted long sessions / many commits; slash command stops between domains for review |
| Existing root docs get lost during migration | Migration is content-preserving; old files only deleted at end of bootstrap, after all 22 domains complete |

## 14. Future Work (out of scope for this spec)

- Visual diagram generation (mermaid) inside `architecture.md` files.
- Auto-generated API doc from Zod schemas (would require an AST pass).
- Doc preview UI (rendered markdown viewer for the team).
- Integration with PR template — auto-suggest domain docs to update based on PR diff.
