# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard rules — read this first

These rules override any superpowers skill, sub-agent instruction, or default behavior. They are enforced by hooks but you are also expected to follow them on your own.

### 1. No auto-commit

**Never** run `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`, or any other command that creates a commit, push, PR, or merge — unless the user has **explicitly** authorized commits during the current session using one of these keywords: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`. The hook scans recent typed user messages (not just the most recent one), so once the user says one of these keywords, subsequent commits within the session stay authorized without re-asking. If the user has not authorized commits at all this session, ask before committing.

This applies even when:
- You are in the middle of an `executing-plans` or `subagent-driven-development` flow that suggests committing between tasks.
- A `finishing-a-development-branch` skill is active.
- You are a sub-agent dispatched by another Claude session.

When in doubt, ask: "Want me to commit this?" — and wait.

A `PreToolUse` Bash hook (`.claude/hooks/no-auto-commit.mjs`) enforces this. If you see `BLOCKED: User has set no-auto-commit`, ask the user to authorize.

### 2. Update docs when code changes

If you edit files under `src/` or `scripts/`, you **must** also update the matching domain documentation under `docs/<domain>/` in the same task. The `Domain Manifest` (at the bottom of this file) is the file→domain map.

A `Stop` hook (`.claude/hooks/doc-sync.mjs`) verifies this automatically. If you see `BLOCKED: Stale docs`, update the listed docs before finishing.

If you create a new file in a path that no manifest entry covers, the hook will tell you. Either add the file to an existing domain's `paths` in the manifest, or create a new domain entry.

### 3. The manifest is the source of truth

Both Claude and the hooks read the same `Domain Manifest` JSON block (below). When adding a new domain or new path glob, edit that block — do not maintain a separate list elsewhere.

### 4. Don't overengineer

Default to the leanest solution that solves the problem the user actually described. Do **not** add infrastructure that anticipates problems they haven't raised.

Concrete defaults this rule overrides:
- **No feature flags by default.** Commits are the rollback unit. Add flags only when the user names production-rollout risk.
- **No custom telemetry plumbing** when Vercel Speed Insights / Sentry / equivalent is already mounted and gives the same signal.
- **No capability detection beyond OS-level signals.** Use `prefers-reduced-motion`, `prefers-reduced-transparency`, `Save-Data` / `prefers-reduced-data`. Don't reach for `navigator.deviceMemory`, `hardwareConcurrency`, `connection.effectiveType` unless the user names a concrete device class to support.
- **No speculative tiers/abstractions.** "Scalable" means *handles the cases listed*, not *handles cases nobody asked about*. Three tiers, not five. Two phases, not seven, when two cover the work.
- **Justify every new file.** Every new file is a maintenance cost. If a single existing file would do, use the existing file.
- **Spec-writing in particular:** prefer 4–5 phases over 7+. Each phase ships a user-visible win, not just plumbing. When tempted to add "while we're here" infrastructure, ask the user instead of adding it.

This rule overrides skills like `brainstorming`, `writing-plans`, and `writing-skills` whose defaults push toward thoroughness — thorough means "covers the real cases," not "speculatively scales."

**Lean is not a licence to under-build.** This rule cuts *speculative* scope — not *real* coverage. "Don't overengineer" must never become an excuse to compromise on correctness, robustness, or the cases the user actually has. If the leanest version would silently drop a real case, leave a known footgun, hard-code something that already varies, or force an obvious near-term rework, that is **under-engineering** — do the smart, complete thing and say in one line why the extra bit earns its place. The bar is: **cover every case that genuinely exists, with the least machinery that covers them well** — not the least machinery, full stop. When the lean path and the correct path diverge, name the trade-off to the user rather than quietly picking "less." Smart-and-complete beats both gold-plating and cutting corners.

This rule is not hook-enforced. You're expected to apply it on your own.

### 5. Keep README.md and BUSINESS.md in sync with business-level changes

The per-domain doc-sync hook covers `docs/<domain>/` updates. README.md and BUSINESS.md are the **top-level business status documents** at the repo root. You **must** update them in the same task when your change flips a fact they assert. Triggers:

- A membership tier is added, removed, repriced, or its entries / partner-discount % / shop % change.
- An access rule for a package family changes (e.g. who can see Additional packs, who gets partner access).
- A "coming soon" item ships (shop, partner-discount API at 1K+ brands, TikTok / Snapchat insights sync, mobile app on Play Store, second monthly major draw).
- A new "coming soon" item is added to the roadmap.
- The major draw cadence (27th of month), freeze-period rule, or mini-draw trigger model changes.
- The prize catalog changes (power-tool/storage combos, cash tier/bonus amounts).
- The anchor-day-24 billing rule, refund-reversal model, past-due recovery flow, or the $0-trial-invoice guard changes (see §9 of BUSINESS.md).
- An ad platform moves from "prepared / shell only" to "live" or vice versa, OR a tracking provider gains/loses server-side CAPI or ad-spend sync.
- The partner-discount tier-visibility model changes (today: 50 / 75 / 100% of a 7-brand catalog).
- The promo/upsell multiplier model changes (resolution order, default category multipliers, BonusEntryPromo).
- The subscription state machine changes (states, ghost states, reactivation/resubscribe grace rules, autoRenew).
- The rewards pause status changes, or the referral/affiliate reward structure changes.
- The staff access model changes (RBAC permission catalog, roles, staff invite flow, StaffActivity audit log), or an admin tool's guardrails change (e.g. charge-past-due limits).

Both files include a "Coming soon" section — when something ships, **move the line out of "Coming soon" into "Live"** in the same edit, do not leave it in both.

**This rule IS hook-enforced (trigger-based).** The `Stop` hook (`.claude/hooks/doc-sync.mjs`) holds a curated `BUSINESS_TRIGGER_GLOBS` list of business-material source paths; if you edit one of them substantively and touch **neither** README.md nor BUSINESS.md in the same turn, it BLOCKS with `STALE BUSINESS DOCS`. The hook only checks that a root doc was *touched* — it cannot verify the *content* is correct, so you still own getting the wording right (and `/review` should still flag it). If a triggered edit genuinely changed no business-level fact (pure refactor), make a one-line clarifying touch to the relevant BUSINESS.md section to clear the block. When you add a new business-material source file, add its path to `BUSINESS_TRIGGER_GLOBS` in the hook.

### 6. Verify before claiming — AND before branching on assumed state

Never state a fact about the code, this codebase's runtime behavior, or a third-party API/service without first checking. "Checking" means a Read, Grep, Bash command, doc lookup, or runtime probe — not recall.

- If you cannot reach high confidence, say "I haven't verified X" explicitly. Do not phrase guesses as facts.
- After a fix, verify the *end-to-end* behavior, not just the first symptom. The Stripe Basil API issue and the MongoDB index collision were both missed by stopping at the first plausible cause.
- If the user pushes back on a claim, treat that as a signal to re-verify from scratch, not to defend the original claim.

**Verification applies to IMPLEMENTATION decisions, not just statements.** Before writing any conditional that depends on app state (`if (isAuthenticated)`, `if (newUser)`, `if (step === N)`, `if (existingPlainAccount)`), **trace the actual control flow in the code first**. Do not infer from:
- Component / function / API endpoint names (e.g. `/api/auth/register` does NOT auto-login the user in this codebase — step-1 success leaves `isAuthenticated: false` and bridges to step-2 via `guestUserData`).
- "What most apps do" (most apps auto-login on register; this one doesn't).
- Patterns from earlier in the codebase (different modals / endpoints may have different auth flows).
- Prior conversation context (your own earlier statements can be wrong).

Before adding tracking events, side effects, or any state-conditional logic to a multi-step flow, **walk through every possible user path** (new vs returning, guest vs authed, normal vs error, switching state mid-flow) and verify the event/effect fires correctly in each. The "happy path works in my one test" is not enough — bugs hide in the path you didn't think to test.

When the user corrects your mental model (e.g. DJ: *"my register in the membershipmodal doesnt auto grant or login the user if he registers in step1"*), treat it as a **high-signal correction**. Re-trace from the code, do not defend the original claim.

This rule is not hook-enforced. You're expected to apply it on your own.

### 7. Subagent scope discipline

When dispatching subagents (Agent / Task tool), the dispatching prompt must include:
- An **explicit list of files or paths** the subagent may modify.
- An **explicit forbidden list** when the task is scoped to one layer (e.g. frontend-only tasks must list `src/app/api/**` as off-limits).
- A verification step the subagent must run before reporting done.

If a subagent report is truncated or ambiguous, do not mark the task complete — re-read the changed files yourself and finish verification directly. Subagents have twice scope-crept into backend route changes during frontend-only work; the cost of an extra sentence in the prompt is much smaller than the cost of that cleanup.

### 8. Just do the thing on small fixes

For one-line tweaks, color/style changes, copy edits, or single-file bug fixes: make the edit. Do not produce a verbose audit, design rationale, or "here's what I'm about to do" preamble before a 3-line change. If the user asks "why," explain *then*.

Verbose audits belong in `/plan`, `/review`, and `/debug`. Outside those skills, prefer action.

### 9. Worktree convention

Worktrees for this repo live at `<repo-root>/.worktrees/<kebab-branch-name>/`, not under `.claude/worktrees/` or any other location. Use the existing `wt-new.sh` script when present — it handles env file copy and `npm install`. If you're using an EnterWorktree-style tool with a different default, override it.

### 10. Mirror admin API changes to Norm — or flag them

The **internal-norm / OpenClaw** gateway (`docs/internal-norm/`) re-exposes admin data to an external AI by wrapping the **same services** the `/api/admin/**` routes use. So an admin-side change can silently drift the Norm surface. Whenever you **add a read endpoint under `src/app/api/admin/**`**, **change an existing admin route's response shape**, or **change a service that feeds one**:

- If Norm already mirrors that service/domain (check `src/lib/internal-norm/classification.ts` and the route map under `src/app/api/internal/norm/v1/`), you **must** keep it in lockstep in the same task: update the registry entry, the Zod schema (`src/lib/internal-norm/schemas/`), the Norm route, run `npm run build:norm-manifest`, and update `docs/internal-norm/norm-context.md`. A schema↔output mismatch is a **runtime 500** that `tsc` cannot catch — verify with `npm run norm:smoke`. Keep the Norm projection PII-safe (firstName + opaque userId only).
- If it's a **new** admin read Norm could usefully expose but you're not wiring it now, **flag it to the user explicitly** ("this could be mirrored to Norm — want me to?") rather than silently skipping it.

The `adding-api-route` skill encodes this as step 7. This rule is not hook-enforced — you're expected to apply it on your own; `/review` should also flag an admin read/shape change that left Norm stale.

## Commands

Dev/build use **Turbopack**. Both `dev` and `build` first run `prebuild`/`predev` which regenerates the upsell image manifest via `scripts/build-upsell-image-manifest.ts` — if you add/change files under the upsell image directories, that script must succeed before the app will start.

```bash
npm run dev          # next dev --turbopack
npm run build        # next build --turbopack (runs build:upsell-manifest first)
npm run start        # production server
npm run lint         # eslint . --ext .ts,.tsx,.js,.jsx
npm run lint:fix
npm run type-check   # tsc --noEmit
```

There is **no test runner** (no jest/vitest). "Tests" are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`, each wired to its own `package.json` script. To run a single one, invoke its npm script directly — e.g. `npm run test:anchor-billing`, `npm run test:redeemables`, `npm run test:stripe-collection-pause`. The default `npm test` only runs the anchor-billing suite. When adding a new test file, also add a matching `test:*` entry in `package.json` or it will not be discoverable.

Operational scripts (migrations, backfills, reconciliation, Stripe maintenance) live in `scripts/` and are exposed as `migrate:*`, `backfill:*`, `sync:*`, `stripe:*`, `find:*` commands. Most accept `--dry-run`; prefer the `:dry` variant first.

## Architecture

Next.js 15 App Router fullstack app on MongoDB/Mongoose, NextAuth (email + Google), Stripe billing, with Meta/Klaviyo/SendGrid integrations and Cloudinary for media. React 19, Tailwind, Zod for validation, TanStack Query + SWR + Zustand on the client.

### Strict layering (enforced by `.cursor/rules/.cursorrules`)

The codebase enforces a hard separation that you must respect when adding code:

```
src/app/              routing & layout only (App Router)
src/app/api/          route handlers — thin: parse, validate, authorize, delegate
src/components/       UI only, no business logic in JSX, no API calls
src/hooks/            stateful logic, side effects, reusable
src/services/         business logic — the right home for non-trivial logic
src/repositories/     data access where used
src/lib/              cross-cutting infra: mongodb, auth, stripe, email, jobs, errors, rate-limiting, zod
src/models/           Mongoose schemas (one collection per file)
src/utils/            pure utilities, organized by domain (billing, payment, subscription, …)
src/types/            shared TypeScript types
src/middleware.ts     auth gating + CSP nonce injection
```

Hard rules: no DB access from components, no business logic inside `app/api/**` route handlers, no `any` unless unavoidable, return consistent JSON response shapes. When a feature spans layers, the dependency direction is `app → services → repositories/lib → models`.

### Route handler conventions

Handlers in `src/app/api/**` are expected to:
1. Validate input at the boundary (Zod helpers in `src/lib/zod/`).
2. Authorize via `src/lib/api-auth.ts` / NextAuth patterns.
3. Delegate to a service in `src/services/<domain>/` or `src/utils/<domain>/`.
4. Return shapes consistent with siblings — match the existing route files in the same folder before inventing a new shape.

Admin and protected route gating happens in two places: `src/middleware.ts` (matcher excludes `/api`, so it gates pages) **and** per-handler auth checks for `/api/admin/**`. Don't rely on middleware alone for API authorization.

### Security headers and CSP

`next.config.ts` and `src/middleware.ts` together build CSP via `src/utils/security/csp.ts`. In production a per-request nonce is generated in middleware and attached as `x-nonce`; static fallback headers exist in `next.config.ts` for routes middleware doesn't run for. The Stripe webhook route (`/api/stripe/webhook`) gets a special header set (no COEP) so server-to-server POSTs work. If you change CSP or add inline scripts, update both `csp.ts` and verify the nonce is being read in the relevant server component.

### Subsystems with their own conventions (read before editing)

These domains have non-obvious rules documented in `docs/`. Skim the matching doc before changing code in these areas:

- **Billing / Stripe** — `docs/PAST_DUE_REANCHOR.md`, `docs/BILLING_ANCHOR_24.md`, `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/REFUND_REVERSAL.md`, `docs/PAYMENT_ATTRIBUTION.md`, `docs/SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md`. Subscription anchor day, past-due/pause recovery, and refund reversal logic are intricate and have dedicated tests under `src/services/subscription/__tests__/` and `src/utils/payment/__tests__/`. **Footgun:** any mutation that sets `trial_end` / `billing_cycle_anchor` / `proration_behavior` or swaps items on an *existing* subscription can make Stripe auto-spawn an extra `invoice.payment_succeeded` — classify it in the webhook before granting (guard: `isZeroAmountTrialUpdateInvoice`, test: `npm run test:zero-trial-guard`); idempotency-by-id does **not** protect you (the spawned invoice has its own id). Read the pre-flight checklist in `docs/PAST_DUE_REANCHOR.md` before any such change.
- **A/B testing** — `docs/AB_TESTING_*.md` (feature, dedup, DB optimization, metrics).
- **Promo / referrals / affiliates** — `docs/PROMO_BANNER_BEHAVIOUR.md`, `docs/PROMO_PAGE_ANALYTICS.md`, `docs/REFERRAL_SYSTEM.md`, `docs/UTM_ATTRIBUTION.md`. Affiliate commission/recurring backfills have dedicated scripts.
- **Error reporting** — `docs/ERROR_REPORTING_AND_LOGGING.md`, `docs/ERROR_REPORTING_SYSTEM.md`. There is a real `ErrorReport` Mongo model + admin routes; do not invent a parallel logger.
- **Email** — `docs/EMAIL_MODULE.md`, `docs/SENDGRID_TESTING_GUIDE.md`. SendGrid for transactional (**code-as-source** in `src/lib/email/templates.ts` + `components.ts` — no HTML files), Klaviyo for marketing (paste-ready HTML under `email-templates/klaviyo/`, export snapshots under `email-templates/klaviyo-exports/`). Keep changes in lockstep with `src/lib/email/`.
- **Tracking** — `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md`, `docs/GTM_INTEGRATION.md`, Meta CAPI lives in `src/lib/facebook.ts` (test: `npm run test:facebook-capi`).
- **Timezone/DST** — `TESTING-TIMEZONE-DST.md`. Date-sensitive billing logic uses `date-fns-tz`; there are DST transition test scripts under `scripts/test-dst-transitions.ts`.
- **Internal Norm / OpenClaw AI** — `docs/internal-norm/` (start at `README.md` → `architecture.md` → `patterns.md`). A secure HTTP gateway at `/api/internal/norm/v1/*` that exposes **read-only** admin data to **Norm**, an external **OpenClaw AI** assistant the owner runs on a Mac mini. Every route is wrapped by `withNorm()` (HMAC auth → permission → kill switch → rate limit → audit → **runtime `responseSchema` validation**). The registry `src/lib/internal-norm/classification.ts` is the source of truth; `npm run build:norm-manifest` regenerates the published manifest. **Lockstep rule:** when `classification.ts`, any `src/lib/internal-norm/schemas/*`, or any `src/app/api/internal/norm/v1/**` route changes, update `docs/internal-norm/norm-context.md` (the brief fed into Norm's context) in the same change. A schema/output mismatch is a **runtime 500**, invisible to `tsc` — verify with `npm run norm:smoke`. Reads bypass the per-permission grant; the PII boundary lives in each endpoint's Zod projection (`firstName` + opaque `userId` only). To land it in production / merge to main, see `docs/internal-norm/merge-to-main.md`.

### Cursor agents (`.cursor/agents/*.md`)

This repo has nine specialist Cursor subagents (frontend, backend-api, mongo-data, stripe-billing, growth-integrations, qa-review, architecture-refactor, auth-security, devops-performance) plus an orchestrator rule (`.cursor/rules/orchestrator.mdc`). They are Cursor-specific and **not** invocable from Claude Code, but their files document the boundary each domain expects you to respect — read the relevant one if a task is non-trivial in that domain. The orchestrator rule encodes when QA review is mandatory: multi-file changes, payments, auth/security, DB schema/migrations, or production-critical paths.

## Conventions worth knowing

- **No new patterns without need.** `.cursorrules` explicitly forbids large refactors or introducing new architectural patterns alongside existing ones — extend what's there. Keep handlers thin; if you're tempted to put logic in `route.ts`, that logic belongs in `src/services/`.
- **Unused vars** — see `docs/UNUSED-VARS-CONVENTIONS.md` (the repo prefers genuine deletion over `_` prefixing in most cases).
- **Mongo connections** — see `docs/MONGODB_CONNECTION_BEST_PRACTICES.md`. Use `src/lib/mongodb.ts`; do not open ad hoc connections in scripts (the `scripts/*.ts` already follow this).
- **Console output** — production builds strip `console.log`/`info`/`debug`/`warn` (`next.config.ts` `compiler.removeConsole`). Use `console.error` for genuine errors that must survive, or route through `ErrorReport`. **This also applies when debugging staging / Vercel preview deploys** — those are production builds, so any temporary `console.log` you add to diagnose a live issue will be invisible. Use `console.error` for ad-hoc debug logging on staging too.
- **`mongoose` is `serverExternalPackages`** — don't try to bundle it into client code.
- **Operational scripts must show progress.** Long-running `scripts/*.ts` (backfills, migrations, syncs, reconciliations) run via `tsx` — **not** the Next build — so `console.log` is **not** stripped there; use it freely. Every such script must emit: (1) an **up-front total count** (so progress has a denominator), (2) a **periodic progress line** with `processed/total (%) · rate/sec · ETA` on an *adaptive cadence* (~20 lines regardless of size, so even a few-hundred-row run visibly moves), and (3) a **final summary**. A script that prints a header then goes silent for minutes reads as "hung" — never ship that. Reference implementations: `scripts/backfill-converting-platform.ts`, `scripts/backfill-klaviyo-membership-properties.ts` (also: `--dry-run` default-safe, append-mode CSV audit log, 3-tier exit codes). The `writing-ops-script` skill enforces the dry-run + audit parts; this bullet adds the progress-logging requirement.

## Domain Manifest

This is the **machine-readable map** of file globs → documentation folders. Both Claude and the doc-sync hook (`.claude/hooks/doc-sync.mjs`) read this block to determine which `docs/<domain>/` files must be updated when a given source file changes.

**Editing rules:**
- Add a new domain when you introduce a feature that doesn't fit any existing one.
- Update `paths` when you move/rename source files.
- The `lastVerified` date is auto-bumped by the doc-sync hook when docs are updated; do not hand-edit unless intentionally resetting.
- Keep one domain per logical feature; do not split a single feature across multiple domains.

The manifest format is JSON (versioned). Path globs use minimatch syntax (`**` for any depth, `{a,b}` for alternatives).

<!-- DOMAIN-MANIFEST-START -->
```json
{
  "version": 1,
  "lastModified": "2026-07-06",
  "domains": {
    "subscription": {
      "docs": "docs/subscription/",
      "paths": [
        "src/services/subscription/**",
        "src/services/admin/membershipAnalyticsPersistence.ts",
        "src/services/admin/MembershipAnalyticsService.ts",
        "src/utils/subscription/**",
        "src/utils/membership/**",
        "src/models/User.ts",
        "src/models/MembershipPackage.ts",
        "src/models/MembershipRenewalCycle.ts",
        "src/models/MembershipStatusHistory.ts",
        "src/models/CancellationFlowEvent.ts",
        "src/models/MembershipDailySnapshot.ts",
        "src/models/ChargeJobLock.ts",
        "src/app/api/subscription/**",
        "src/app/api/memberships/**",
        "src/app/(site)/terms/**",
        "src/app/(site)/competition-term-majordraw/**",
        "src/components/modals/CancellationFlowModal/**",
        "src/components/modals/RenewalFailedModal/**",
        "src/components/modals/DowngradeConfirmModal/**",
        "src/components/modals/StripePaymentModal/**",
        "src/hooks/useStripeSubscription.ts",
        "src/hooks/useMemberships.ts",
        "src/hooks/useActivePackage.ts",
        "src/hooks/useMembershipModal.ts",
        "src/hooks/useMembershipCardCta.ts",
        "src/hooks/useOpenMembershipModalListener.ts",
        "src/app/(site)/membership/**"
      ],
      "lastVerified": "2026-07-06"
    },
    "billing-stripe": {
      "docs": "docs/billing-stripe/",
      "paths": [
        "src/utils/billing/**",
        "src/lib/stripe.ts",
        "src/lib/stripe-client.ts",
        "src/services/allowlist/**",
        "src/services/stripe-webhook-queue/**",
        "src/services/stripe-webhook-handlers/**",
        "src/models/PaymentEvent.ts",
        "src/models/ProcessedStripeEvent.ts",
        "src/models/InvoiceChargeLog.ts",
        "src/models/AllowlistAction.ts",
        "src/models/BlockedTransaction.ts",
        "src/models/StripeWebhookQueue.ts",
        "scripts/backfill-blocked-transactions.ts",
        "scripts/sync-allowlist-from-blocked-transactions.ts",
        "scripts/investigate-blocked-transactions.ts",
        "src/app/api/stripe/**",
        "src/app/api/admin/allowlist/**",
        "src/app/api/admin/stripe-webhook-queue/**",
        "src/app/api/cron/reconcile-blocked-transactions/**",
        "src/app/api/cron/process-stripe-webhook-queue/**",
        "src/components/admin/StripeWebhookQueueManagement.tsx",
        "src/hooks/queries/admin/useBlockedCards.ts",
        "src/hooks/queries/admin/useAllowlistActions.ts",
        "src/hooks/queries/admin/useAllowlistStats.ts",
        "src/utils/billing/declineCodeLabels.ts"
      ],
      "lastVerified": "2026-07-02"
    },
    "payment": {
      "docs": "docs/payment/",
      "paths": [
        "src/lib/payment/**",
        "src/utils/payment/**",
        "src/components/payment/**",
        "src/app/api/payment-intent/**",
        "src/app/api/payment-status/**",
        "src/hooks/usePaymentIntent.ts",
        "src/hooks/useSetupIntent.ts",
        "src/hooks/use3DSRedirectHandler.ts",
        "src/hooks/useSavedPaymentMethods.ts"
      ],
      "lastVerified": "2026-07-02"
    },
    "draws": {
      "docs": "docs/draws/",
      "paths": [
        "src/utils/draws/**",
        "src/models/MajorDraw.ts",
        "src/models/MiniDraw.ts",
        "src/models/TicketEntry.ts",
        "src/models/Winner.ts",
        "src/models/MonthlyEntryCampaign.ts",
        "src/models/SegmentSnapshot.ts",
        "src/app/api/major-draw/**",
        "src/app/api/mini-draw/**",
        "src/app/api/mini-draws/**",
        "src/app/api/winners/**",
        "src/app/(site)/major-draw/**",
        "src/app/(site)/mini-draws/**",
        "src/app/(site)/mini-draw-success/**",
        "src/app/(site)/draw-results/**",
        "src/app/(site)/winners/**",
        "src/app/(site)/components/WinnerTestimoniesClient.tsx",
        "src/utils/giveaway-eligibility.ts",
        "src/utils/winner-name-formatter.ts",
        "src/utils/winners.ts",
        "src/types/winner.ts",
        "src/lib/purchaseCooldown.ts",
        "src/hooks/useMajorDrawEntryCta.ts",
        "src/hooks/useMajorDrawPurchaseGate.ts",
        "src/hooks/useMiniDrawTrigger.ts",
        "src/hooks/useMiniDrawPurchase.ts",
        "src/hooks/usePastDrawsData.ts"
      ],
      "lastVerified": "2026-07-03"
    },
    "rewards-redeemables": {
      "docs": "docs/rewards-redeemables/",
      "paths": [
        "src/services/redeemables/**",
        "src/utils/redeemables/**",
        "src/models/RedeemableIssuance.ts",
        "src/models/MilestoneIssuance.ts",
        "src/models/MilestoneReward.ts",
        "src/app/api/redeemables/**",
        "src/app/api/rewards/**",
        "src/app/(site)/rewards/**",
        "src/lib/rewardsGuard.ts",
        "src/hooks/usePrizeCatalog.ts",
        "src/hooks/useEntryRewardToast.ts",
        "src/utils/rewards-widget-spotlight-storage.ts"
      ],
      "lastVerified": "2026-07-02"
    },
    "promo": {
      "docs": "docs/promo/",
      "paths": [
        "src/services/promo/**",
        "src/services/promo-analytics/**",
        "src/utils/promo/**",
        "src/utils/promo-analytics/**",
        "src/utils/promo-banner/**",
        "src/models/Promo.ts",
        "src/models/PromoLink.ts",
        "src/models/ScheduledPromo.ts",
        "src/models/AlternatingPromoMultiplier.ts",
        "src/models/PromoBannerText.ts",
        "src/models/PromoAnalyticsVisit.ts",
        "src/models/BonusEntryPromo.ts",
        "src/app/api/promo/**",
        "src/app/api/codes/**",
        "src/app/promotions/**",
        "src/app/(site)/promotion/**",
        "src/components/promo/**",
        "src/components/banners/**",
        "src/hooks/usePromoLink.ts",
        "src/hooks/usePromoPageTracking.ts",
        "src/hooks/usePromoWelcomeModal.ts",
        "src/generated/landingImageManifest.ts",
        "scripts/build-landing-image-manifest.ts",
        "scripts/check-landing-hero-assets.mjs",
        "scripts/convert-drawn-tonight-tomorrow-to-webp.ts",
        "scripts/convert-drawn-tonight-tomorrow-videos.ts"
      ],
      "lastVerified": "2026-07-01"
    },
    "affiliate": {
      "docs": "docs/affiliate/",
      "paths": [
        "src/models/Affiliate.ts",
        "src/models/AffiliateCommission.ts",
        "src/models/AffiliatePayout.ts",
        "src/lib/affiliate.ts",
        "src/lib/affiliate-auth.ts",
        "src/utils/affiliate/**",
        "src/services/affiliate/**",
        "src/app/api/affiliate/**",
        "src/app/(site)/affiliate/**",
        "src/hooks/useAffiliateAuth.ts",
        "src/hooks/useAffiliateLink.ts"
      ],
      "lastVerified": "2026-06-19"
    },
    "referrals": {
      "docs": "docs/referrals/",
      "paths": [
        "src/lib/referral.ts",
        "src/models/ReferralEvent.ts",
        "src/app/api/referrals/**",
        "src/hooks/useReferralCode.ts",
        "src/components/modals/ReferFriendModal/**"
      ],
      "lastVerified": "2026-06-17"
    },
    "partner": {
      "docs": "docs/partner/",
      "paths": [
        "src/utils/partner-discounts/**",
        "src/lib/partner-discount-sso.ts",
        "src/models/PartnerApplication.ts",
        "src/models/PartnerDiscount.ts",
        "src/models/PartnerDiscountSsoIssuance.ts",
        "src/app/api/partner-applications/**",
        "src/app/api/partner-discount/**",
        "src/app/(site)/partner/**"
      ],
      "lastVerified": "2026-06-24"
    },
    "upsell": {
      "docs": "docs/upsell/",
      "paths": [
        "src/services/upsell/**",
        "src/utils/upsell/**",
        "src/app/api/upsell/**",
        "src/app/api/cancellation-upsell/**",
        "src/app/(site)/upsell-success/**",
        "src/components/upload/**",
        "src/models/UpsellMultiplierConfig.ts",
        "src/generated/upsellImageManifest.ts",
        "scripts/build-upsell-image-manifest.ts"
      ],
      "lastVerified": "2026-05-14"
    },
    "cart-shop-products": {
      "docs": "docs/cart-shop-products/",
      "paths": [
        "src/app/(site)/shop/**",
        "src/app/(site)/checkout/**",
        "src/app/(site)/purchase-success/**",
        "src/app/api/cart/**",
        "src/app/api/products/**",
        "src/app/api/orders/**",
        "src/models/Product.ts",
        "src/models/Order.ts",
        "src/contexts/CartContext.tsx",
        "src/hooks/usePurchaseInvalidation.ts"
      ],
      "lastVerified": "2026-06-19"
    },
    "error-reporting": {
      "docs": "docs/error-reporting/",
      "paths": [
        "src/services/error-reporting/**",
        "src/utils/error-reporting/**",
        "src/models/ErrorReport.ts",
        "src/app/api/error-reports/**",
        "src/app/api/admin/error-reports/**",
        "src/components/error/**",
        "src/hooks/useErrorHandling.ts",
        "src/hooks/useErrorRecovery.ts",
        "src/lib/errors/**"
      ],
      "lastVerified": "2026-06-10"
    },
    "auth": {
      "docs": "docs/auth/",
      "paths": [
        "src/lib/auth.ts",
        "src/lib/api-auth.ts",
        "src/lib/jwt.ts",
        "src/lib/debugAuth.ts",
        "src/utils/auth/**",
        "src/components/auth/**",
        "src/app/api/auth/**",
        "src/app/api/user/**",
        "src/app/api/users/**",
        "src/app/login/**",
        "src/app/reset-password/**",
        "src/app/oauth-redirect/**",
        "src/app/staff-setup/**",
        "src/lib/api-auth-permissions.ts",
        "src/lib/permissions.ts",
        "src/lib/permission-descriptions.ts",
        "src/hooks/usePermissions.ts",
        "src/models/Role.ts",
        "scripts/migrate-seed-staff-roles.ts",
        "src/contexts/UserContext.tsx"
      ],
      "lastVerified": "2026-06-19"
    },
    "email": {
      "docs": "docs/email/",
      "paths": [
        "src/lib/email/**",
        "src/lib/email.ts",
        "src/lib/sms.ts",
        "src/app/api/newsletter/**",
        "src/app/email-preview/**",
        "src/components/email-preview/**",
        "email-templates/**"
      ],
      "lastVerified": "2026-06-18"
    },
    "tracking": {
      "docs": "docs/tracking/",
      "paths": [
        "src/components/FacebookPixel.tsx",
        "src/components/GoogleTagManager.tsx",
        "src/components/KlaviyoPageTracker.tsx",
        "src/components/KlaviyoScriptLoader.tsx",
        "src/components/PixelTracker.tsx",
        "src/components/TikTokPixel.tsx",
        "src/components/tracking/**",
        "src/components/admin/TikTokAdsManagement.tsx",
        "src/components/admin/SnapchatAdsManagement.tsx",
        "src/lib/facebook.ts",
        "src/lib/facebook-env.ts",
        "src/lib/facebook-marketing.ts",
        "src/lib/tiktok.ts",
        "src/lib/gtm.ts",
        "src/lib/klaviyo.ts",
        "src/lib/tracking/**",
        "src/lib/utm/**",
        "src/utils/tracking/**",
        "src/utils/integrations/**",
        "src/utils/meta/**",
        "src/utils/utm/**",
        "src/services/meta/**",
        "src/services/facebook-ads/**",
        "src/services/klaviyo/**",
        "src/services/attribution/**",
        "src/types/attribution.ts",
        "src/services/facebook-ads-health/**",
        "src/models/MetaAdDestination.ts",
        "src/models/MetaAdInsightsDaily.ts",
        "src/models/TikTokAdInsightsDaily.ts",
        "src/models/SnapchatAdInsightsDaily.ts",
        "src/models/FacebookAdsHealthSnooze.ts",
        "src/models/FacebookAdsHealthSettings.ts",
        "src/app/layout.tsx",
        "src/app/api/facebook/**",
        "src/app/api/tracking/**",
        "src/hooks/useKlaviyoTracking.ts",
        "src/hooks/usePixelTracking.ts",
        "src/hooks/useAttribution.ts",
        "src/hooks/useUTMPersistence.ts"
      ],
      "lastVerified": "2026-07-02"
    },
    "ab-testing": {
      "docs": "docs/ab-testing/",
      "paths": [
        "src/services/ab-testing/**",
        "src/components/ab-testing/**",
        "src/hooks/ab-testing/**",
        "src/repositories/ab-testing/**",
        "src/app/api/ab-testing/**",
        "src/models/ab-testing/**",
        "src/utils/ab-testing/**"
      ],
      "lastVerified": "2026-07-06"
    },
    "metrics-analytics": {
      "docs": "docs/metrics-analytics/",
      "paths": [
        "src/services/metrics/**",
        "src/services/analytics/**",
        "src/utils/metrics/**",
        "src/models/LandingPageMetricsDaily.ts",
        "src/schemas/metrics/**",
        "src/types/metrics/**",
        "src/hooks/useUserMetrics.ts",
        "src/hooks/useDailyUserMetrics.ts",
        "src/hooks/useMetricsFormatting.ts",
        "src/hooks/useUserMajorDrawComparison.ts",
        "src/utils/dashboard-entry-hold.ts",
        "src/utils/dashboard-landing-session.ts"
      ],
      "lastVerified": "2026-05-04"
    },
    "contact": {
      "docs": "docs/contact/",
      "paths": [
        "src/app/api/contact-submissions/**",
        "src/models/ContactSubmission.ts",
        "src/app/(site)/contact/**"
      ],
      "lastVerified": "2026-04-28"
    },
    "theme": {
      "docs": "docs/theme/",
      "paths": [
        "src/components/theme/**",
        "src/hooks/useTheme.ts",
        "src/hooks/useHtmlDarkForUi.ts",
        "src/utils/themeBootstrap.ts",
        "src/contexts/ThemeContext.tsx",
        "src/contexts/AdminThemeContext.tsx",
        "src/stores/useThemeStore.ts",
        "src/stores/usePromoThemeStore.ts"
      ],
      "lastVerified": "2026-04-28"
    },
    "shared-ui": {
      "docs": "docs/shared-ui/",
      "paths": [
        "src/components/ui/**",
        "src/components/cards/**",
        "src/components/cta/**",
        "src/components/layout/**",
        "src/components/loading/**",
        "src/components/modals/**",
        "src/components/sections/**",
        "src/components/seo/**",
        "src/components/system/**",
        "src/components/features/**",
        "src/components/filters/**",
        "src/components/index.ts",
        "src/lib/device/**",
        "src/utils/dom/**",
        "src/utils/motion/**",
        "src/utils/url/**",
        "src/utils/common/**",
        "src/utils/display-name.ts",
        "src/utils/brand-utils.ts",
        "src/utils/images/**",
        "src/utils/package-colors/**",
        "src/utils/prize-brand-colors.ts",
        "src/hooks/useDeviceProfile.ts",
        "src/hooks/useInViewportAnimation.ts",
        "src/hooks/useLeafTimer.ts",
        "src/hooks/useTilt.ts",
        "src/types/upsell.ts",
        "src/app/globals.css",
        "src/app/not-found.tsx"
      ],
      "lastVerified": "2026-07-06"
    },
    "client-state": {
      "docs": "docs/client-state/",
      "paths": [
        "src/contexts/LoadingContext.tsx",
        "src/contexts/SidebarContext.tsx",
        "src/contexts/AdminUserModalContext.tsx",
        "src/stores/index.ts",
        "src/stores/useModalPriorityStore.ts",
        "src/stores/useDashboardSheetStore.ts",
        "src/lib/queries.ts",
        "src/lib/queryKeys.ts",
        "src/lib/requestDeduplication.ts",
        "src/app/providers.tsx",
        "src/hooks/queries/**",
        "src/hooks/useDebounce.ts",
        "src/hooks/useMediaQuery.ts",
        "src/hooks/useIsLgUp.ts",
        "src/hooks/useScrollAnimation.ts",
        "src/hooks/useLoadingStates.ts",
        "src/hooks/usePrefetching.ts",
        "src/hooks/useConfetti.ts"
      ],
      "lastVerified": "2026-07-02"
    },
    "internal-norm": {
      "docs": "docs/internal-norm/",
      "paths": [
        "src/lib/internal-norm/**",
        "src/app/api/internal/norm/**",
        "src/app/api/admin/internal-norm/**",
        "src/app/admin/component/internal-norm/**",
        "src/services/admin/DashboardStatsService.ts",
        "src/models/NormCallLog.ts",
        "src/models/NormTriggerReceipt.ts",
        "src/models/NormPendingAction.ts",
        "src/models/NormEndpointSettings.ts",
        "src/utils/admin/resolveNormDateRange.ts",
        "src/generated/normToolsManifest.json",
        "scripts/build-norm-manifest.ts",
        "scripts/internal-norm-smoke.ts",
        "scripts/migrations/2026-05-20-create-norm-user-and-role.ts",
        "eslint/rules/norm-must-import-service.js",
        "eslint/rules/index.js"
      ],
      "lastVerified": "2026-07-02"
    },
    "admin": {
      "docs": "docs/admin/",
      "paths": [
        "src/app/admin/**",
        "src/components/admin/**",
        "src/components/admin/facebook-ads-health/**",
        "src/app/api/admin/**",
        "src/app/api/admin/facebook-ads/health/**",
        "src/features/admin/**",
        "src/models/ChargeJobLock.ts",
        "src/models/ChargeJobRun.ts",
        "src/models/ChargeJobWorklist.ts",
        "src/models/StaffActivity.ts",
        "src/lib/audit-log.ts",
        "src/lib/__tests__/staff-activity.test.ts",
        "src/server/admin/**",
        "src/services/admin/**",
        "src/services/admin/chargePastDueHistory.ts",
        "src/utils/admin/**",
        "src/types/admin/**",
        "src/types/admin.ts",
        "src/hooks/useAdminMobileDateToolbarSlot.ts",
        "src/hooks/useAdminDateFilter.ts",
        "src/models/DashboardStatsDailySnapshot.ts",
        "src/services/admin/dashboard-stats/**"
      ],
      "lastVerified": "2026-07-06"
    },
    "dashboard-account": {
      "docs": "docs/dashboard-account/",
      "paths": [
        "src/app/(site)/my-account/**",
        "src/app/(site)/components/LandingPageTrigger.tsx",
        "src/hooks/useDashboardEntryDisplay.ts",
        "src/hooks/useDashboardLandingOrchestration.ts",
        "src/hooks/useDashboardState.ts",
        "src/utils/dashboard/**"
      ],
      "lastVerified": "2026-07-02"
    },
    "security-csp": {
      "docs": "docs/security-csp/",
      "paths": [
        "src/middleware.ts",
        "src/utils/security/**",
        "src/lib/rate-limiting/**",
        "src/models/RateLimit.ts",
        "next.config.ts"
      ],
      "lastVerified": "2026-06-19"
    },
    "mongodb": {
      "docs": "docs/mongodb/",
      "paths": [
        "src/lib/mongodb.ts",
        "src/utils/database/**",
        "src/lib/jobs/**",
        "src/repositories/index.ts",
        "src/repositories/PaymentEventRepository.ts",
        "src/repositories/PromoAnalyticsRepository.ts"
      ],
      "lastVerified": "2026-06-10"
    },
    "infrastructure": {
      "docs": "docs/infrastructure/",
      "paths": [
        "package.json",
        "package-lock.json",
        "vercel.json",
        "tsconfig.json",
        "eslint.config.mjs",
        "eslint/rules/no-models-in-client.js",
        ".gitignore",
        ".env.example",
        "src/app/api/health/**",
        "src/app/api/cron/**",
        "src/app/api/upload/**",
        "src/app/api/images/**",
        "src/lib/cloudinary.ts",
        "src/lib/environment.ts",
        "src/lib/http/**",
        "src/lib/zod/**",
        "src/utils/dates/**",
        "src/utils/validation/**",
        "src/utils/webhook/**",
        "scripts/migrations/**",
        "scripts/seed-*.ts",
        "scripts/migrate-*.ts",
        "scripts/fix-*.{ts,mjs,js}",
        "scripts/update-*.ts",
        "scripts/sync-*.ts",
        "scripts/backfill-*.ts",
        "scripts/cleanup-*.ts",
        "scripts/find-*.ts",
        "scripts/audit-*.ts",
        "scripts/reverse-*.ts",
        "scripts/stripe-*.ts",
        "scripts/verify-*.ts",
        "scripts/reconcile-*.ts",
        "scripts/connect-ops-db.ts"
      ],
      "lastVerified": "2026-07-06"
    },
    "dev-tooling": {
      "docs": "docs/dev-tooling/",
      "paths": [
        "src/app/api/debug/**",
        "src/app/api/dev/**",
        "src/app/api/test/**",
        "src/app/api/test-db/**",
        "src/app/dev/**",
        "src/app/test-pixels/**",
        "src/components/dev/**",
        "src/examples/**",
        "scripts/test-*.ts",
        "scripts/wt-*.sh",
        "scripts/codemods/**"
      ],
      "lastVerified": "2026-06-24"
    },
    "config-and-data": {
      "docs": "docs/config-and-data/",
      "paths": [
        "src/config/**",
        "src/constants/**",
        "src/data/**"
      ],
      "lastVerified": "2026-06-23"
    }
  }
}
```
<!-- DOMAIN-MANIFEST-END -->
