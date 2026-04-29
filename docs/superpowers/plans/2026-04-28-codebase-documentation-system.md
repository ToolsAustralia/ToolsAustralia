# Codebase Documentation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CRITICAL — No auto-commit:** This plan builds a no-auto-commit system. Every commit step in this plan requires explicit user approval *before* running `git commit`. Do not commit autonomously even between tasks. After Task 5 (hook wiring) is complete, the no-auto-commit hook will enforce this automatically.

**Goal:** Build the documentation infrastructure (CLAUDE.md changes, 3 hook scripts, settings.json wiring, 3 slash commands) so that the user can later run `/doc-bootstrap` to generate per-domain docs across the codebase, with automatic doc-sync enforcement on every session.

**Architecture:** A single source-of-truth Domain Manifest in CLAUDE.md (JSON block) drives three consumers — Claude itself (reads it for context), a Stop hook (parses it to detect stale docs), and slash commands (use it for per-domain operations). A separate PreToolUse Bash hook blocks commit/push/PR commands unless the user explicitly authorized.

**Tech Stack:** Node.js (≥18, ESM modules), Claude Code hooks (PostToolUse, Stop, PreToolUse), Claude Code slash commands (markdown with frontmatter), JSON for the manifest format (chosen over YAML for zero-dependency parsing).

**Spec:** [`docs/superpowers/specs/2026-04-28-codebase-documentation-system-design.md`](../specs/2026-04-28-codebase-documentation-system-design.md)

---

## File Structure

| File | Purpose | Status |
|---|---|---|
| `CLAUDE.md` | Add Hard Rules section + Domain Manifest JSON block | Modify |
| `.gitignore` | Ignore `.claude/.touched-files` transient state | Modify |
| `.claude/settings.json` | Wire up hooks (separate from existing `settings.local.json`) | Create |
| `.claude/hooks/touched-files-track.mjs` | PostToolUse — append edited paths to tracker | Create |
| `.claude/hooks/no-auto-commit.mjs` | PreToolUse Bash — block commit/push/PR unless authorized | Create |
| `.claude/hooks/doc-sync.mjs` | Stop — verify touched files have matching doc updates | Create |
| `.claude/hooks/lib/manifest.mjs` | Shared helper — parse Domain Manifest JSON from CLAUDE.md | Create |
| `.claude/hooks/lib/match.mjs` | Shared helper — minimal glob matcher for path → domain lookup | Create |
| `.claude/commands/doc-bootstrap.md` | Slash command for one-time documentation pass | Create |
| `.claude/commands/doc-domain.md` | Slash command for refreshing/adding a single domain | Create |
| `.claude/commands/doc-sync.md` | Slash command for manual audit | Create |

**Note on the manifest format:** The spec section 7 described YAML for human-readability. The plan uses JSON instead because (a) Node parses it natively with zero dependencies, and (b) Claude reads JSON just as well. JSON inside a fenced code block in markdown stays readable. Update the spec at the end to reflect this if approved.

---

## Task 0: Pre-flight checks

**Files:** none (verification only)

- [ ] **Step 0.1: Verify Node.js version**

Run:
```bash
node --version
```
Expected: `v18.x.x` or higher. If lower, abort and ask the user to upgrade. (Hooks use ESM and modern features.)

- [ ] **Step 0.2: Verify git is on a feature branch (not main)**

Run:
```bash
git branch --show-current
```
Expected: not `main` or `master`. Current spec was written on `fix/CancellingSub`. If on main, ask the user to create a branch first.

- [ ] **Step 0.3: Verify spec exists and is committed/saved**

Run:
```bash
ls "docs/superpowers/specs/2026-04-28-codebase-documentation-system-design.md"
```
Expected: file exists. If not, abort — the spec is the source of truth for this plan.

- [ ] **Step 0.4: Verify `.claude/` exists and inspect current state**

Run:
```bash
ls -la .claude/
```
Expected: directory exists, contains `settings.local.json`, may or may not contain `settings.json`. Note what's there before modifying.

- [ ] **Step 0.5: Create needed subdirectories**

Run:
```bash
mkdir -p .claude/hooks/lib .claude/commands
```
Expected: no error (directories created or already exist).

---

## Task 1: Add Hard Rules section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (add new top-level section after the intro line)

- [ ] **Step 1.1: Read current CLAUDE.md**

Run:
```bash
wc -l CLAUDE.md
```
Expected: ~83 lines. Use Read tool to see the full content. Locate line 4 (blank line after the "This file provides guidance..." intro).

- [ ] **Step 1.2: Insert Hard Rules section after the intro**

Use the Edit tool. Find this exact string in `CLAUDE.md`:

```
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
```

Replace with:

```
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard rules — read this first

These rules override any superpowers skill, sub-agent instruction, or default behavior. They are enforced by hooks but you are also expected to follow them on your own.

### 1. No auto-commit

**Never** run `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`, or any other command that creates a commit, push, PR, or merge — unless the user **explicitly** authorizes the action in their **most recent** message using one of these keywords: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`.

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

## Commands
```

- [ ] **Step 1.3: Verify edit applied**

Run:
```bash
head -50 CLAUDE.md
```
Expected: see the new "Hard rules — read this first" section between the intro and "## Commands". The original `## Commands` section is preserved unchanged.

- [ ] **Step 1.4: User approval gate for first commit**

Ask the user: "Hard rules section added to CLAUDE.md. Want to commit this change before I continue with Task 2 (manifest block)? Or wait until all CLAUDE.md edits are done?"

Wait for response. Do **not** commit autonomously.

---

## Task 2: Append Domain Manifest to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (append new section at the end)

- [ ] **Step 2.1: Append manifest section to end of CLAUDE.md**

Use the Edit tool. Find this exact string at the end of `CLAUDE.md`:

```
- **`mongoose` is `serverExternalPackages`** — don't try to bundle it into client code.
```

Replace with:

```
- **`mongoose` is `serverExternalPackages`** — don't try to bundle it into client code.

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
  "lastModified": "2026-04-28",
  "domains": {
    "subscription": {
      "docs": "docs/subscription/",
      "paths": [
        "src/services/subscription/**",
        "src/utils/subscription/**",
        "src/utils/membership/**",
        "src/models/User.ts",
        "src/models/MembershipPackage.ts",
        "src/models/MembershipRenewalCycle.ts",
        "src/models/MembershipStatusHistory.ts",
        "src/models/ChargeJobLock.ts",
        "src/app/api/subscription/**",
        "src/app/api/memberships/**",
        "src/hooks/useStripeSubscription.ts",
        "src/hooks/useMemberships.ts",
        "src/hooks/useActivePackage.ts",
        "src/hooks/useMembershipModal.ts"
      ],
      "lastVerified": null
    },
    "billing-stripe": {
      "docs": "docs/billing-stripe/",
      "paths": [
        "src/utils/billing/**",
        "src/lib/stripe.ts",
        "src/lib/stripe-client.ts",
        "src/models/PaymentEvent.ts",
        "src/models/ProcessedStripeEvent.ts",
        "src/models/InvoiceChargeLog.ts",
        "src/app/api/stripe/**",
        "src/app/api/invoice/**"
      ],
      "lastVerified": null
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
      "lastVerified": null
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
        "src/app/api/winners/**",
        "src/app/(site)/major-draw/**",
        "src/app/(site)/mini-draws/**",
        "src/app/(site)/mini-draw-success/**",
        "src/app/(site)/draw-results/**",
        "src/app/(site)/winners/**",
        "src/utils/giveaway-eligibility.ts",
        "src/utils/winner-name-formatter.ts",
        "src/utils/winners.ts",
        "src/lib/purchaseCooldown.ts",
        "src/hooks/useMajorDrawEntryCta.ts",
        "src/hooks/useMajorDrawPurchaseGate.ts",
        "src/hooks/useMiniDrawTrigger.ts",
        "src/hooks/usePastDrawsData.ts"
      ],
      "lastVerified": null
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
      "lastVerified": null
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
        "src/hooks/usePromoWelcomeModal.ts"
      ],
      "lastVerified": null
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
        "src/app/api/affiliate/**",
        "src/app/(site)/affiliate/**",
        "src/hooks/useAffiliateAuth.ts",
        "src/hooks/useAffiliateLink.ts"
      ],
      "lastVerified": null
    },
    "referrals": {
      "docs": "docs/referrals/",
      "paths": [
        "src/lib/referral.ts",
        "src/models/ReferralEvent.ts",
        "src/app/api/referrals/**",
        "src/hooks/useReferralCode.ts"
      ],
      "lastVerified": null
    },
    "partner": {
      "docs": "docs/partner/",
      "paths": [
        "src/utils/partner-discounts/**",
        "src/models/PartnerApplication.ts",
        "src/models/PartnerDiscount.ts",
        "src/app/api/partner-applications/**",
        "src/app/api/partner-discount/**",
        "src/app/(site)/partner/**"
      ],
      "lastVerified": null
    },
    "upsell": {
      "docs": "docs/upsell/",
      "paths": [
        "src/utils/upsell/**",
        "src/app/api/upsell/**",
        "src/app/api/cancellation-upsell/**",
        "src/app/(site)/upsell-success/**",
        "src/components/upload/**",
        "src/generated/upsellImageManifest.ts",
        "scripts/build-upsell-image-manifest.ts"
      ],
      "lastVerified": null
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
      "lastVerified": null
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
      "lastVerified": null
    },
    "auth": {
      "docs": "docs/auth/",
      "paths": [
        "src/lib/auth.ts",
        "src/lib/api-auth.ts",
        "src/lib/jwt.ts",
        "src/lib/debugAuth.ts",
        "src/components/auth/**",
        "src/app/api/auth/**",
        "src/app/api/user/**",
        "src/app/api/users/**",
        "src/app/login/**",
        "src/app/reset-password/**",
        "src/app/oauth-redirect/**",
        "src/contexts/UserContext.tsx"
      ],
      "lastVerified": null
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
        "*-email-template.html"
      ],
      "lastVerified": null
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
        "src/lib/facebook.ts",
        "src/lib/facebook-env.ts",
        "src/lib/facebook-marketing.ts",
        "src/lib/gtm.ts",
        "src/lib/klaviyo.ts",
        "src/lib/utm/**",
        "src/utils/tracking/**",
        "src/utils/integrations/**",
        "src/utils/meta/**",
        "src/utils/utm/**",
        "src/services/meta/**",
        "src/models/MetaAdDestination.ts",
        "src/models/MetaAdInsightsDaily.ts",
        "src/app/api/facebook/**",
        "src/app/api/tracking/**",
        "src/hooks/useKlaviyoTracking.ts",
        "src/hooks/usePixelTracking.ts",
        "src/hooks/useAttribution.ts",
        "src/hooks/useUTMPersistence.ts"
      ],
      "lastVerified": null
    },
    "ab-testing": {
      "docs": "docs/ab-testing/",
      "paths": [
        "src/services/ab-testing/**",
        "src/components/ab-testing/**",
        "src/hooks/ab-testing/**",
        "src/repositories/ab-testing/**",
        "src/app/api/ab-testing/**",
        "src/models/ab-testing/**"
      ],
      "lastVerified": null
    },
    "metrics-analytics": {
      "docs": "docs/metrics-analytics/",
      "paths": [
        "src/services/metrics/**",
        "src/services/analytics/**",
        "src/utils/metrics/**",
        "src/models/LandingPageMetricsDaily.ts",
        "src/schemas/metrics/**",
        "src/hooks/useUserMetrics.ts",
        "src/hooks/useDailyUserMetrics.ts",
        "src/hooks/useMetricsFormatting.ts",
        "src/hooks/useUserMajorDrawComparison.ts",
        "src/utils/dashboard-entry-hold.ts",
        "src/utils/dashboard-landing-session.ts"
      ],
      "lastVerified": null
    },
    "contact": {
      "docs": "docs/contact/",
      "paths": [
        "src/app/api/contact-submissions/**",
        "src/models/ContactSubmission.ts",
        "src/app/(site)/contact/**"
      ],
      "lastVerified": null
    },
    "theme": {
      "docs": "docs/theme/",
      "paths": [
        "src/components/theme/**",
        "src/hooks/useTheme.ts",
        "src/hooks/useAutoTheme.ts",
        "src/hooks/useThemeToggleWithHold.ts",
        "src/hooks/useHtmlDarkForUi.ts",
        "src/utils/themeBootstrap.ts",
        "src/utils/themeSchedule.ts",
        "src/contexts/ThemeContext.tsx",
        "src/contexts/AdminThemeContext.tsx",
        "src/stores/useThemeStore.ts",
        "src/stores/usePromoThemeStore.ts"
      ],
      "lastVerified": null
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
        "src/components/filters/**",
        "src/components/index.ts",
        "src/utils/dom/**",
        "src/utils/motion/**",
        "src/utils/url/**",
        "src/utils/common/**",
        "src/utils/display-name.ts",
        "src/utils/brand-utils.ts",
        "src/utils/images/**",
        "src/utils/package-colors/**",
        "src/utils/prize-brand-colors.ts"
      ],
      "lastVerified": null
    },
    "client-state": {
      "docs": "docs/client-state/",
      "paths": [
        "src/contexts/LoadingContext.tsx",
        "src/contexts/SidebarContext.tsx",
        "src/contexts/AdminUserModalContext.tsx",
        "src/stores/index.ts",
        "src/stores/useModalPriorityStore.ts",
        "src/lib/queries.ts",
        "src/lib/queryKeys.ts",
        "src/lib/requestDeduplication.ts",
        "src/hooks/queries/**",
        "src/hooks/useDebounce.ts",
        "src/hooks/useMediaQuery.ts",
        "src/hooks/useIsLgUp.ts",
        "src/hooks/useScrollAnimation.ts",
        "src/hooks/useLoadingStates.ts",
        "src/hooks/usePrefetching.ts",
        "src/hooks/useConfetti.ts"
      ],
      "lastVerified": null
    },
    "admin": {
      "docs": "docs/admin/",
      "paths": [
        "src/app/admin/**",
        "src/components/admin/**",
        "src/app/api/admin/**",
        "src/features/admin/**",
        "src/server/admin/**",
        "src/hooks/useAdminMobileDateToolbarSlot.ts"
      ],
      "lastVerified": null
    },
    "dashboard-account": {
      "docs": "docs/dashboard-account/",
      "paths": [
        "src/app/(site)/my-account/**",
        "src/app/(site)/components/LandingPageTrigger.tsx",
        "src/hooks/useDashboardEntryDisplay.ts",
        "src/hooks/useDashboardLandingOrchestration.ts"
      ],
      "lastVerified": null
    },
    "security-csp": {
      "docs": "docs/security-csp/",
      "paths": [
        "src/middleware.ts",
        "src/utils/security/**",
        "src/lib/rate-limiting/**",
        "next.config.ts"
      ],
      "lastVerified": null
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
      "lastVerified": null
    },
    "infrastructure": {
      "docs": "docs/infrastructure/",
      "paths": [
        "src/app/api/health/**",
        "src/app/api/cron/**",
        "src/app/api/upload/**",
        "src/app/api/images/**",
        "src/lib/cloudinary.ts",
        "src/lib/environment.ts",
        "src/lib/zod/**",
        "src/utils/dates/**",
        "src/utils/validation/**",
        "src/utils/webhook/**",
        "scripts/migrations/**",
        "scripts/seed-admin-data.ts",
        "scripts/migrate-*.ts",
        "scripts/fix-*.{ts,mjs,js}",
        "scripts/update-*.ts",
        "scripts/sync-*.ts",
        "scripts/backfill-*.ts",
        "scripts/find-*.ts",
        "scripts/stripe-*.ts"
      ],
      "lastVerified": null
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
        "scripts/test-*.ts"
      ],
      "lastVerified": null
    },
    "config-and-data": {
      "docs": "docs/config-and-data/",
      "paths": [
        "src/config/**",
        "src/constants/**",
        "src/data/**"
      ],
      "lastVerified": null
    }
  }
}
```
<!-- DOMAIN-MANIFEST-END -->
```

- [ ] **Step 2.2: Verify manifest is valid JSON**

Run:
```bash
node -e "const fs = require('fs'); const m = fs.readFileSync('CLAUDE.md', 'utf8'); const start = m.indexOf('<!-- DOMAIN-MANIFEST-START -->'); const end = m.indexOf('<!-- DOMAIN-MANIFEST-END -->'); const block = m.slice(start, end); const json = block.match(/\`\`\`json\n([\s\S]+?)\n\`\`\`/)[1]; const parsed = JSON.parse(json); console.log('OK — domains:', Object.keys(parsed.domains).length);"
```
Expected: `OK — domains: 28`

If parse fails, the JSON has a syntax error — fix it before continuing.

- [ ] **Step 2.3: User approval gate**

Ask the user: "CLAUDE.md now has Hard Rules + 28-domain Manifest. Want to commit `CLAUDE.md` before I move to Task 3 (hook scripts)?"

Wait for explicit approval.

---

## Task 3: Add `.claude/.touched-files` to `.gitignore`

**Files:**
- Modify: `.gitignore` (append entry)

- [ ] **Step 3.1: Check current .gitignore**

Use Read tool on `.gitignore`. Verify `.claude/.touched-files` is not already present.

- [ ] **Step 3.2: Append gitignore entries**

Use the Edit tool. Append to the end of `.gitignore`:

```
# Claude Code hook state (transient — do not commit)
.claude/.touched-files
.claude/.session-state
```

- [ ] **Step 3.3: Verify**

Run:
```bash
tail -5 .gitignore
```
Expected: see the two new lines.

---

## Task 4: Create shared manifest parser helper

**Files:**
- Create: `.claude/hooks/lib/manifest.mjs`

- [ ] **Step 4.1: Write the helper**

Create file `.claude/hooks/lib/manifest.mjs` with this exact content:

```javascript
// Parses the Domain Manifest JSON block out of CLAUDE.md.
// Used by all three hooks. Single source of truth for the file→domain map.

import fs from "node:fs";
import path from "node:path";

const MANIFEST_START = "<!-- DOMAIN-MANIFEST-START -->";
const MANIFEST_END = "<!-- DOMAIN-MANIFEST-END -->";

/**
 * Read CLAUDE.md and extract the manifest as a parsed JSON object.
 * @param {string} repoRoot Absolute path to repo root.
 * @returns {{version: number, domains: Record<string, {docs: string, paths: string[], lastVerified: string|null}>}}
 */
export function readManifest(repoRoot) {
  const claudeMdPath = path.join(repoRoot, "CLAUDE.md");
  const content = fs.readFileSync(claudeMdPath, "utf8");

  const startIdx = content.indexOf(MANIFEST_START);
  const endIdx = content.indexOf(MANIFEST_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Domain Manifest markers not found in CLAUDE.md. Expected ${MANIFEST_START} and ${MANIFEST_END}.`,
    );
  }

  const block = content.slice(startIdx, endIdx);
  const match = block.match(/```json\n([\s\S]+?)\n```/);
  if (!match) {
    throw new Error("Domain Manifest block found but no fenced ```json``` content inside.");
  }

  return JSON.parse(match[1]);
}

/**
 * Update a domain's lastVerified date and write CLAUDE.md back.
 * @param {string} repoRoot
 * @param {string} domainName
 * @param {string} isoDate e.g. "2026-04-28"
 */
export function bumpLastVerified(repoRoot, domainName, isoDate) {
  const claudeMdPath = path.join(repoRoot, "CLAUDE.md");
  const content = fs.readFileSync(claudeMdPath, "utf8");
  const manifest = readManifest(repoRoot);
  if (!manifest.domains[domainName]) {
    throw new Error(`Cannot bump lastVerified: domain "${domainName}" not in manifest.`);
  }
  manifest.domains[domainName].lastVerified = isoDate;
  manifest.lastModified = isoDate;

  const startIdx = content.indexOf(MANIFEST_START);
  const endIdx = content.indexOf(MANIFEST_END);
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx);
  const newBlock = `${MANIFEST_START}\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`;
  fs.writeFileSync(claudeMdPath, before + newBlock + after);
}
```

- [ ] **Step 4.2: Verify the helper parses the manifest**

Run:
```bash
node --input-type=module -e "import('./.claude/hooks/lib/manifest.mjs').then(m => { const r = m.readManifest(process.cwd()); console.log('domains:', Object.keys(r.domains).length, 'version:', r.version); });"
```
Expected: `domains: 28 version: 1`

If error, debug the parser before continuing.

---

## Task 5: Create shared glob matcher helper

**Files:**
- Create: `.claude/hooks/lib/match.mjs`

- [ ] **Step 5.1: Write the matcher**

Create `.claude/hooks/lib/match.mjs`:

```javascript
// Minimal glob matcher for path patterns used in Domain Manifest.
// Supports: ** (any depth), * (single segment), {a,b} (alternatives), literal paths.
// Avoids npm dependency on minimatch — these patterns are simple enough to match in-house.

/**
 * Convert a glob pattern to a RegExp.
 * @param {string} pattern e.g. "src/services/**" or "src/models/{User,Order}.ts"
 * @returns {RegExp}
 */
export function globToRegex(pattern) {
  // Escape regex special chars except for our glob meta chars
  let regex = pattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(",").join("|")})`)
    .replace(/\*\*/g, "<<DOUBLESTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLESTAR>>/g, ".*");
  return new RegExp(`^${regex}$`);
}

/**
 * Test if a file path matches any of a domain's path patterns.
 * Path comparison is normalized to forward slashes.
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function matchesAny(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => globToRegex(p).test(normalized));
}

/**
 * Find the domain (if any) that owns the given file path.
 * Returns null if no domain matches. Returns first match if multiple
 * (manifest must guarantee uniqueness; doc-sync audit catches violations).
 * @param {object} manifest Output of readManifest()
 * @param {string} filePath
 * @returns {string|null}
 */
export function findDomain(manifest, filePath) {
  for (const [name, def] of Object.entries(manifest.domains)) {
    if (matchesAny(filePath, def.paths)) return name;
  }
  return null;
}
```

- [ ] **Step 5.2: Verify the matcher**

Run:
```bash
node --input-type=module -e "import('./.claude/hooks/lib/match.mjs').then(async m => { const manifest = (await import('./.claude/hooks/lib/manifest.mjs')).readManifest(process.cwd()); console.log('subscription test:', m.findDomain(manifest, 'src/services/subscription/foo.ts')); console.log('User model:', m.findDomain(manifest, 'src/models/User.ts')); console.log('orphan:', m.findDomain(manifest, 'src/random/path/foo.ts')); });"
```
Expected:
```
subscription test: subscription
User model: subscription
orphan: null
```

---

## Task 6: Create the touched-files tracker hook

**Files:**
- Create: `.claude/hooks/touched-files-track.mjs`

- [ ] **Step 6.1: Write the hook**

Create `.claude/hooks/touched-files-track.mjs`:

```javascript
#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|Write|MultiEdit|NotebookEdit).
// Appends each edited absolute path to .claude/.touched-files.
// Stays silent unless something is broken.
//
// Hook input format (stdin JSON):
//   { "hook_event_name": "PostToolUse", "tool_name": "Edit",
//     "tool_input": { "file_path": "/abs/path/to/file.ts", ... }, ... }

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TRACKER_PATH = ".claude/.touched-files";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // Malformed input — fail silently, do not block.
    process.exit(0);
  }

  const filePath = event?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Only track files inside the repo. Filter absolute paths to relative.
  const cwd = process.cwd();
  let relPath = filePath;
  if (path.isAbsolute(filePath)) {
    const r = path.relative(cwd, filePath);
    // If the file is outside the repo, don't track it.
    if (r.startsWith("..")) process.exit(0);
    relPath = r;
  }
  relPath = relPath.replace(/\\/g, "/");

  // Append. Deduplication happens in the Stop hook (read-side).
  fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
  fs.appendFileSync(TRACKER_PATH, relPath + "\n");

  process.exit(0);
}

main().catch(() => process.exit(0));
```

- [ ] **Step 6.2: Smoke test the hook**

Run:
```bash
echo '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"src/services/subscription/foo.ts"}}' | node .claude/hooks/touched-files-track.mjs && cat .claude/.touched-files
```
Expected: file `.claude/.touched-files` exists and contains the line `src/services/subscription/foo.ts`.

- [ ] **Step 6.3: Clean up test state**

Run:
```bash
rm -f .claude/.touched-files
```

---

## Task 7: Create the no-auto-commit hook

**Files:**
- Create: `.claude/hooks/no-auto-commit.mjs`

- [ ] **Step 7.1: Write the hook**

Create `.claude/hooks/no-auto-commit.mjs`:

```javascript
#!/usr/bin/env node
// PreToolUse hook (matcher: Bash).
// Blocks `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`
// unless the latest user message contains an authorizing keyword.
//
// Block by exiting with code 2 and writing reason to stderr.
// Allow by exiting 0 (silent).

import fs from "node:fs";
import process from "node:process";

const BLOCKED_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+add\b/,
  /\bgit\s+push\b/,
  /\bgh\s+pr\s+create\b/,
  /\bgh\s+pr\s+merge\b/,
];

const AUTHORIZE_KEYWORDS = [
  /\bcommit\b/i,
  /\bpush\b/i,
  /\bmerge\b/i,
  /\bmake (a|an?) PR\b/i,
  /\bcreate (a|an?) PR\b/i,
  /\bopen (a|an?) PR\b/i,
  /\bship it\b/i,
  /\bship this\b/i,
];

function isBlockedCommand(cmd) {
  return BLOCKED_PATTERNS.some((re) => re.test(cmd));
}

function latestUserMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
  // Transcript is JSONL: one JSON object per line. Read backwards to find latest user msg.
  const content = fs.readFileSync(transcriptPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.role === "user" || entry?.type === "user") {
      const msg = entry.message?.content ?? entry.content ?? "";
      if (typeof msg === "string") return msg;
      if (Array.isArray(msg)) {
        return msg.map((p) => (typeof p === "string" ? p : p.text ?? "")).join(" ");
      }
    }
  }
  return "";
}

function isAuthorized(userMsg) {
  return AUTHORIZE_KEYWORDS.some((re) => re.test(userMsg));
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let event;
  try { event = JSON.parse(raw); } catch { process.exit(0); }

  const cmd = event?.tool_input?.command ?? "";
  if (!isBlockedCommand(cmd)) process.exit(0);

  const userMsg = latestUserMessage(event?.transcript_path);
  if (isAuthorized(userMsg)) process.exit(0);

  // Block.
  process.stderr.write(
    `BLOCKED: User has set no-auto-commit. The user must explicitly authorize ` +
    `this command in their most recent message using one of: commit, push, merge, ` +
    `make a PR, create a PR, open a PR, ship it.\n` +
    `Command attempted: ${cmd}\n` +
    `Ask the user: "Want me to run this? \`${cmd}\`"\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
```

- [ ] **Step 7.2: Smoke test — blocked path (no authorization)**

Run:
```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m test"},"transcript_path":""}' | node .claude/hooks/no-auto-commit.mjs; echo "exit=$?"
```
Expected: stderr shows `BLOCKED: User has set no-auto-commit...`, `exit=2`.

- [ ] **Step 7.3: Smoke test — non-commit command passes**

Run:
```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm run lint"},"transcript_path":""}' | node .claude/hooks/no-auto-commit.mjs; echo "exit=$?"
```
Expected: no stderr output, `exit=0`.

- [ ] **Step 7.4: Smoke test — authorized commit passes**

Create a fake transcript:
```bash
mkdir -p /tmp/claude-hook-test && echo '{"role":"user","content":"yes commit this please"}' > /tmp/claude-hook-test/transcript.jsonl
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m test"},"transcript_path":"/tmp/claude-hook-test/transcript.jsonl"}' | node .claude/hooks/no-auto-commit.mjs; echo "exit=$?"
```
Expected: no stderr, `exit=0`. (User said "commit", so authorized.)

- [ ] **Step 7.5: Clean up test state**

Run:
```bash
rm -rf /tmp/claude-hook-test
```

---

## Task 8: Create the doc-sync Stop hook

**Files:**
- Create: `.claude/hooks/doc-sync.mjs`

This is the largest hook. It does five things on every Stop:
1. Read `.touched-files`.
2. Filter out trivia (comment-only / whitespace-only edits).
3. Group remaining files by domain (via the manifest).
4. Check whether each affected domain's `docs/<domain>/` files were also edited.
5. Block (exit 2) if any domain has stale docs; otherwise bump `lastVerified` and clear the tracker.

- [ ] **Step 8.1: Write the hook**

Create `.claude/hooks/doc-sync.mjs`:

```javascript
#!/usr/bin/env node
// Stop hook. Verifies that touched source files have matching doc updates.
// Reads .touched-files (populated by PostToolUse hook touched-files-track.mjs).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { readManifest, bumpLastVerified } from "./lib/manifest.mjs";
import { findDomain } from "./lib/match.mjs";

const TRACKER_PATH = ".claude/.touched-files";
const ROT_DAYS = 90;
const ROT_CHANGE_THRESHOLD = 5;

function readTouched() {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  const content = fs.readFileSync(TRACKER_PATH, "utf8");
  return [...new Set(content.split("\n").map((l) => l.trim()).filter(Boolean))];
}

function clearTouched() {
  if (fs.existsSync(TRACKER_PATH)) fs.unlinkSync(TRACKER_PATH);
}

/**
 * Determine if a file edit is trivia (comments-only, whitespace-only, import-order-only).
 * Uses git diff to inspect actual changes. If file is new (no diff against HEAD), not trivia.
 */
function isTrivialEdit(filePath) {
  try {
    const diff = execSync(`git diff -U0 -- "${filePath}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    if (!diff) return true; // No unstaged change (already staged/committed) → ignore.
    const changedLines = diff
      .split("\n")
      .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
      .map((l) => l.slice(1).trim());
    if (changedLines.length === 0) return true;
    return changedLines.every(
      (l) =>
        l === "" ||
        l.startsWith("//") ||
        l.startsWith("/*") ||
        l.startsWith("*") ||
        l.startsWith("*/") ||
        /^import\s/.test(l) ||
        /^export\s+\*\s+from/.test(l),
    );
  } catch {
    return false; // On error, treat as substantive (safer).
  }
}

/**
 * Get list of files modified in working tree (staged or unstaged) under a path prefix.
 */
function changedFilesUnder(prefix) {
  try {
    const out = execSync(`git status --porcelain -- "${prefix}"`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

/**
 * Get count of commits touching a path glob in the last N days.
 */
function commitCountSince(pathGlob, sinceIso) {
  try {
    const out = execSync(
      `git log --since="${sinceIso}" --oneline -- "${pathGlob}"`,
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

async function main() {
  // Read Stop event input (we don't strictly need it but consume to be polite).
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event = {};
  try { event = JSON.parse(raw); } catch {}

  // Avoid recursive blocking: if hook was already invoked once this turn and Claude is retrying, allow.
  if (event?.stop_hook_active) {
    process.exit(0);
  }

  const touched = readTouched();
  if (touched.length === 0) process.exit(0);

  const repoRoot = process.cwd();
  let manifest;
  try {
    manifest = readManifest(repoRoot);
  } catch (e) {
    process.stderr.write(`doc-sync: cannot read Domain Manifest from CLAUDE.md: ${e.message}\n`);
    process.exit(0); // Soft-fail; do not block Claude on infra errors.
  }

  // Filter out trivia and docs themselves and config-only edits.
  const substantive = touched.filter((f) => {
    if (f.startsWith("docs/")) return false;     // editing docs is not "code change"
    if (f.startsWith(".claude/")) return false;  // hook/skill edits don't need doc updates
    if (f === "CLAUDE.md") return false;         // CLAUDE.md edits track themselves
    return !isTrivialEdit(f);
  });

  if (substantive.length === 0) {
    clearTouched();
    process.exit(0);
  }

  // Group by domain.
  const affected = new Map(); // domain -> string[] of files
  const orphans = [];
  for (const f of substantive) {
    const d = findDomain(manifest, f);
    if (d) {
      if (!affected.has(d)) affected.set(d, []);
      affected.get(d).push(f);
    } else {
      orphans.push(f);
    }
  }

  // Check each affected domain: were docs/<domain>/ files also changed?
  const stale = [];
  const fresh = [];
  for (const [domain, files] of affected) {
    const docsPath = manifest.domains[domain].docs;
    const docChanges = changedFilesUnder(docsPath);
    if (docChanges.length === 0) {
      stale.push({ domain, files, docsPath });
    } else {
      fresh.push(domain);
    }
  }

  // Build the message.
  const lines = [];

  if (orphans.length > 0) {
    lines.push("");
    lines.push("ORPHAN FILES — these source files do not match any domain in the Domain Manifest:");
    for (const o of orphans) lines.push(`  - ${o}`);
    lines.push("");
    lines.push("Add them to an existing domain's `paths` in CLAUDE.md, or define a new domain.");
  }

  if (stale.length > 0) {
    lines.push("");
    lines.push("STALE DOCS — you edited code in these domains but did not update their documentation:");
    for (const { domain, files, docsPath } of stale) {
      lines.push(`  • ${domain} (docs: ${docsPath})`);
      for (const f of files.slice(0, 5)) lines.push(`      - ${f}`);
      if (files.length > 5) lines.push(`      ... and ${files.length - 5} more`);
    }
    lines.push("");
    lines.push("Update the relevant files inside each domain's docs folder before finishing.");
    lines.push("Typical mapping:");
    lines.push("  - new/modified API route → docs/<domain>/api.md");
    lines.push("  - new/modified Mongo model → docs/<domain>/models.md");
    lines.push("  - new/modified component or hook → docs/<domain>/frontend.md");
    lines.push("  - new/modified service / business rule → docs/<domain>/backend.md");
    lines.push("  - bug fix from an incident → docs/<domain>/gotchas.md");
  }

  // Rot detection — flag fresh domains that haven't been verified in a while.
  const today = todayIso();
  const rotted = [];
  for (const domain of fresh) {
    const lv = manifest.domains[domain].lastVerified;
    if (!lv) continue;
    const days = daysBetween(lv, today);
    if (days < ROT_DAYS) continue;
    const commits = commitCountSince(`src/`, `${days} days ago`);
    if (commits >= ROT_CHANGE_THRESHOLD) {
      rotted.push({ domain, days, commits });
    }
  }
  if (rotted.length > 0) {
    lines.push("");
    lines.push("DOC ROT — these domains were updated this session, but their last full verification is old:");
    for (const r of rotted) {
      lines.push(`  - ${r.domain}: lastVerified ${r.days} days ago, ${r.commits} commits since`);
    }
    lines.push("Consider running `/doc-domain <name>` to do a deeper refresh.");
  }

  if (stale.length > 0 || orphans.length > 0) {
    process.stderr.write(
      `BLOCKED: Documentation is out of sync with code changes.\n${lines.join("\n")}\n\n` +
      `After updating the docs, your Stop will be allowed.\n`,
    );
    // Do NOT clear .touched-files — let the next Stop re-evaluate.
    process.exit(2);
  }

  // All clean — bump lastVerified for each fresh domain and clear tracker.
  for (const domain of fresh) {
    try { bumpLastVerified(repoRoot, domain, today); } catch {}
  }

  if (rotted.length > 0) {
    // Non-blocking notice (printed to stdout, which Claude Code shows as transcript output).
    process.stdout.write(lines.join("\n") + "\n");
  }

  clearTouched();
  process.exit(0);
}

main().catch((e) => {
  // Soft-fail on internal errors — don't block Claude on hook bugs.
  process.stderr.write(`doc-sync: internal error: ${e.message}\n`);
  process.exit(0);
});
```

- [ ] **Step 8.2: Smoke test — empty tracker passes silently**

Run:
```bash
rm -f .claude/.touched-files
echo '{"hook_event_name":"Stop","stop_hook_active":false}' | node .claude/hooks/doc-sync.mjs; echo "exit=$?"
```
Expected: no output, `exit=0`.

- [ ] **Step 8.3: Smoke test — touched file with stale docs blocks**

Setup:
```bash
echo "src/services/subscription/test-fake.ts" > .claude/.touched-files
mkdir -p src/services/subscription
echo "// test" > src/services/subscription/test-fake.ts
git add -N src/services/subscription/test-fake.ts 2>/dev/null
```

Run:
```bash
echo '{"hook_event_name":"Stop","stop_hook_active":false}' | node .claude/hooks/doc-sync.mjs; echo "exit=$?"
```
Expected: stderr shows `BLOCKED: Documentation is out of sync...` mentioning `subscription`, `exit=2`.

Cleanup:
```bash
rm -f src/services/subscription/test-fake.ts .claude/.touched-files
```

- [ ] **Step 8.4: Smoke test — stop_hook_active flag bypasses**

Run:
```bash
echo "src/services/subscription/foo.ts" > .claude/.touched-files
echo '{"hook_event_name":"Stop","stop_hook_active":true}' | node .claude/hooks/doc-sync.mjs; echo "exit=$?"
```
Expected: no output, `exit=0` (recursion guard works).

Cleanup:
```bash
rm -f .claude/.touched-files
```

---

## Task 9: Wire hooks into `.claude/settings.json`

**Files:**
- Create: `.claude/settings.json` (new file — does NOT replace `settings.local.json`)

- [ ] **Step 9.1: Write the settings file**

Create `.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/touched-files-track.mjs"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/no-auto-commit.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/doc-sync.mjs"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 9.2: Verify JSON is valid**

Run:
```bash
node -e "console.log('OK:', Object.keys(JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')).hooks).join(','))"
```
Expected: `OK: PostToolUse,PreToolUse,Stop`

- [ ] **Step 9.3: Restart-warning notice to user**

Tell the user (text, not commit):

> "Settings.json with hooks is wired up. Hooks won't take effect in *this* Claude Code session — they activate when you start a fresh Claude Code session. The next session you open will have the auto-doc-sync and no-auto-commit hooks active."

---

## Task 10: Create `/doc-bootstrap` slash command

**Files:**
- Create: `.claude/commands/doc-bootstrap.md`

- [ ] **Step 10.1: Write the command**

Create `.claude/commands/doc-bootstrap.md`:

```markdown
---
description: One-time documentation bootstrap. Generates docs/<domain>/ folders for every domain in the Domain Manifest, migrating existing root /docs/*.md content into the new structure.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /doc-bootstrap — One-time codebase documentation pass

You are running a long, multi-commit documentation pass. Read this entire prompt before starting.

## What you are doing

Generate per-domain documentation folders under `docs/<domain>/` for every domain listed in the **Domain Manifest** (the JSON block in `CLAUDE.md` between `<!-- DOMAIN-MANIFEST-START -->` and `<!-- DOMAIN-MANIFEST-END -->`).

For each domain:
1. Read every source file matching the domain's `paths` globs.
2. Generate the standardized 8 base docs (always) plus 2 conditional docs (`models.md` if Mongo models present; `testing.md` if `__tests__` present).
3. Migrate any existing root-level `docs/*.md` or `src/docs/*.md` content that belongs to this domain into the new files.
4. Update `lastVerified` in the manifest to today's ISO date.
5. **Stop and ask the user to review and commit before moving to the next domain.**

## The 8 + 2 doc template

For every domain, generate these files inside `docs/<domain>/`:

| File | Always | Content |
|---|---|---|
| `README.md` | yes | Index — one-liner per other doc, ownership, related domains, links |
| `architecture.md` | yes | Data flow, layers, key entities, sequence diagrams (mermaid optional), how this domain fits the broader app |
| `frontend.md` | yes | Pages, components, hooks, client state. Stub with `_N/A — this domain has no frontend surface. See [architecture.md](./architecture.md)._` if domain has zero UI. |
| `backend.md` | yes | Services, repositories, jobs, webhooks, business rules. Stub if N/A. |
| `api.md` | yes | Every route under this domain — method, path, auth, request/response shape, error codes. Stub if N/A. |
| `rules.md` | yes | Hard must / must-not constraints (e.g., "all subscription dates use date-fns-tz Australia/Sydney"). Pull from CLAUDE.md, .cursor/rules/, code comments, and your own discoveries. |
| `patterns.md` | yes | Recurring code conventions in this domain (naming, error shapes, validation patterns). |
| `gotchas.md` | yes | Past incidents, surprising behaviors, race conditions, "looks-buggy-but-isn't". Mine git log, existing root docs, and code comments for these. |
| `models.md` | only if Mongo models present | One section per `models/*.ts` in this domain — schema fields, indexes, relationships, hooks |
| `testing.md` | only if tests present | Test setup, how to run, what's covered. The repo uses standalone tsx scripts, not jest — see CLAUDE.md for the npm script convention. |

### Stub format for N/A files

```markdown
# frontend.md

_N/A — this domain has no frontend surface. See [architecture.md](./architecture.md)._
```

## Migration of existing docs

Many domains overlap with existing markdown:

- **`docs/*.md`** at repo root (e.g., `BILLING_ANCHOR_24.md`, `EMAIL_MODULE.md`, `REFERRAL_SYSTEM.md`, `ERROR_REPORTING_SYSTEM.md`)
- **`src/docs/*.md`** (e.g., `KLAVIYO_INTEGRATION.md`, `PIXEL_INTEGRATION.md`)
- **Root-level `TESTING-TIMEZONE-DST.md`**

For each domain, before writing new docs:
1. Find existing docs that belong to this domain (check filename + content).
2. Distribute their content across the new files (architecture details → architecture.md, gotchas → gotchas.md, etc.).
3. Preserve all factual content. Do not summarize away specifics like ticket numbers, dates, env var names, or code paths.
4. **Do not delete the source file yet** — wait until the entire bootstrap is done (final task).

## Per-domain workflow

For each domain in the manifest, execute this loop:

1. **Read manifest entry** — paths, docs folder.
2. **Glob the source files** — every file matching the paths. Read them all.
3. **Find related existing docs** — search `docs/`, `src/docs/`, repo root for relevant `.md` files.
4. **Determine which docs to create** — always 8, plus models.md if `src/models/` paths in this domain, plus testing.md if `__tests__/` directories exist under any path.
5. **Generate each doc** — write factual, code-grounded content. Cite file paths for every claim. No invented "best practices" — only document what's actually there.
6. **Update the manifest** — set `lastVerified` for this domain to today's ISO date in the JSON block in CLAUDE.md.
7. **Stop and ask the user**: "Domain `<name>`: 8 (or 9/10) docs generated under `docs/<name>/`. Migrated content from: [list]. Please review. Want to commit this domain?"
8. **Wait for explicit user approval** before running `git commit`. Use commit message: `docs(<domain>): bootstrap domain documentation`.
9. After commit (or after user says skip), move to next domain.

## After all domains are done

10. Generate `docs/README.md` — a top-level index with a table linking to all 28 domain folders, brief one-liner per domain.
11. Delete the migrated original docs (`docs/*.md` files at root that were absorbed; `src/docs/*.md` files; root `TESTING-TIMEZONE-DST.md`). **Do NOT delete `docs/superpowers/` or any docs that did not get migrated.**
12. Stop and ask the user to review the deletion list before committing the final cleanup as `docs: complete bootstrap, remove migrated source files`.

## Hard rules (overriding any other behavior)

- **No autonomous commits.** Every commit requires explicit user approval. The repo has a no-auto-commit hook; do not try to bypass it.
- **No invented content.** If you don't know something, write `_TODO: verify with the team._` rather than guess. Better an honest gap than a wrong claim.
- **One domain at a time.** Do not parallelize across domains. The user needs to review each one before the next.
- **Cite code locations.** Use `[filename.ts:42](src/path/filename.ts#L42)` markdown links so the user can click through.
- **Mention `.cursor/agents/*.md`** in `patterns.md` where relevant. Each domain has a Cursor subagent that documents its boundary.

## How to start

1. Read CLAUDE.md fully (especially the Domain Manifest).
2. List the 28 domains and confirm with the user: "Bootstrap will generate ~250 doc files across 28 domains, ~28 commits. Start with `subscription` (alphabetical) or do you want to pick the order?"
3. Wait for user choice.
4. Execute the per-domain workflow.
```

- [ ] **Step 10.2: Verify the file is valid markdown**

Run:
```bash
head -20 .claude/commands/doc-bootstrap.md
```
Expected: see frontmatter `---` + `description:` + `allowed-tools:`.

---

## Task 11: Create `/doc-domain` slash command

**Files:**
- Create: `.claude/commands/doc-domain.md`

- [ ] **Step 11.1: Write the command**

Create `.claude/commands/doc-domain.md`:

```markdown
---
description: Refresh documentation for a single domain (or scaffold a new one). Usage: /doc-domain <name>. If the domain exists in the Domain Manifest, re-reads its source files and surgically updates each doc. If not, scaffolds the standard 8 doc files and prompts the user to add a manifest entry.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <domain-name>
---

# /doc-domain — Refresh or add a single domain's documentation

You are refreshing (or creating) docs for one domain only.

## Argument

The user invoked you with `$ARGUMENTS` — that is the domain name (e.g., `subscription`, `billing-stripe`).

If `$ARGUMENTS` is empty, ask: "Which domain? (e.g., subscription, billing-stripe, draws, ...). Or run `/doc-sync` first to see the full list."

## Step 1: Read the manifest

Read `CLAUDE.md`. Extract the `Domain Manifest` JSON block. Look up `domains[<name>]`.

### If domain exists → REFRESH MODE

1. Read every source file matching the domain's `paths` globs.
2. Read every existing file in the domain's `docs` folder.
3. For each existing doc, **diff against current code reality**:
   - What's new in the code that the doc doesn't mention?
   - What does the doc claim that no longer exists in code?
   - What's been renamed/moved?
4. Surgically Edit each doc — change only what's stale. Do not blindly overwrite the whole file.
5. Update `lastVerified` to today's ISO date in the manifest.
6. Stop and ask the user: "Refreshed `docs/<name>/`. Diff summary: [N files changed, K lines added/removed]. Commit?"
7. Wait for explicit approval before `git commit -m "docs(<name>): refresh"`.

### If domain does NOT exist → SCAFFOLD MODE

1. Confirm with the user: "`<name>` is not in the Domain Manifest. Scaffold it as a new domain?"
2. Ask: "What source paths should this domain own? (Glob list — I'll add them to the manifest.)"
3. After user provides paths, generate the 8 base docs (plus models.md/testing.md as applicable) using the same template described in `/doc-bootstrap`.
4. Edit `CLAUDE.md` to add the new entry to the Domain Manifest JSON block:
   ```
   "<name>": {
     "docs": "docs/<name>/",
     "paths": [ ...user-supplied... ],
     "lastVerified": "<today>"
   }
   ```
5. Stop and ask the user: "New domain `<name>` scaffolded with N docs and added to manifest. Commit?"
6. Wait for explicit approval.

## Hard rules

- No autonomous commits. Always ask.
- No invented content. Use `_TODO: verify._` for unknowns.
- Surgical edits in refresh mode; full scaffold in scaffold mode. Never both.
- Cite code locations with `[file.ts:N](src/path/file.ts#LN)` links.

## Edge cases

- **Multiple domain match for one source file** — flag as a violation: "File X matches both `<a>` and `<b>` in the manifest — please disambiguate."
- **Domain has no matching source files** — ask the user: "`<name>` is in the manifest but no files match its paths. Was the domain renamed or deleted?"
- **Empty `lastVerified` (null)** — treat as "never verified" and do a full read pass, not just a diff.
```

- [ ] **Step 11.2: Verify**

Run:
```bash
head -10 .claude/commands/doc-domain.md
```
Expected: see frontmatter with `argument-hint: <domain-name>`.

---

## Task 12: Create `/doc-sync` slash command

**Files:**
- Create: `.claude/commands/doc-sync.md`

- [ ] **Step 12.1: Write the command**

Create `.claude/commands/doc-sync.md`:

```markdown
---
description: Manual audit — walks src/ and scripts/ to verify every file matches exactly one domain in the Domain Manifest. Reports orphans (files no domain covers) and ghosts (manifest paths pointing to deleted files). Optional companion to the automatic Stop hook.
allowed-tools: Read, Glob, Bash
---

# /doc-sync — Manual codebase coverage audit

You are running a one-shot audit. No file edits, no commits — just a report.

## What you are checking

The Domain Manifest in `CLAUDE.md` claims to map every source file to exactly one domain. This audit verifies that claim against reality.

## Step 1: Read the manifest

Extract the JSON block from `CLAUDE.md` between `<!-- DOMAIN-MANIFEST-START -->` and `<!-- DOMAIN-MANIFEST-END -->`. Parse it.

## Step 2: List all source files

Run:
```bash
find src scripts -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.js" \) 2>/dev/null
```

(Or use the Glob tool with patterns `src/**/*.{ts,tsx,mjs,js}` and `scripts/**/*.{ts,mjs,js}`.)

## Step 3: For each file, find its owning domain

Use the matching logic in `.claude/hooks/lib/match.mjs` (path globs: `**` = any depth, `*` = single segment, `{a,b}` = alternatives).

Categorize:
- **Owned (1 domain match)** — happy path, no report needed.
- **Orphan (0 domain matches)** — file exists but no manifest entry covers it.
- **Conflict (2+ domain matches)** — manifest violation; should never happen.

## Step 4: Check for ghost manifest entries

For each `paths` glob in the manifest, glob the filesystem. If the glob matches zero files, the entry is a "ghost" (likely points to deleted/renamed code).

## Step 5: Report

Output a concise report. No editing.

Format:
```
# Doc-Sync Audit Report — <today>

## Coverage
- Total source files: 1234
- Owned by a domain: 1230 (99.7%)
- Orphans: 4
- Conflicts: 0

## Orphans
- src/path/foo.ts
- src/path/bar.ts
...

For each orphan, suggest a domain to assign it to (based on file path/name heuristics).

## Conflicts
(none)

## Ghost manifest entries
- `subscription` → `src/services/subscription/old-thing.ts` (no files match)
- `promo` → `src/utils/promo-banner/legacy.ts` (no files match)

## Recommendations
1. Assign orphans to domains by editing CLAUDE.md.
2. Remove ghost entries (or fix renames).
3. After fixes, run `/doc-sync` again to confirm clean.
```

## Hard rules

- **Read-only.** Do not edit any files. Do not commit. Just report.
- **No false alarms.** Files in `node_modules/`, `.next/`, `dist/`, `coverage/`, `.git/` are excluded automatically by `find`. Verify your glob excludes these.
- **Cite paths.** Every orphan and ghost should include the full path so the user can click through.
```

- [ ] **Step 12.2: Verify**

Run:
```bash
head -10 .claude/commands/doc-sync.md
```
Expected: see frontmatter with `description:` mentioning "audit".

---

## Task 13: User approval gate before final commit

**Files:** none (just a checkpoint)

- [ ] **Step 13.1: Verify all files are in place**

Run:
```bash
ls -la .claude/hooks/ .claude/commands/ .claude/settings.json
```
Expected: see all 5 hook/lib files, all 3 command files, settings.json present.

- [ ] **Step 13.2: Verify all created files via git status**

Run:
```bash
git status --short
```
Expected: see modified `CLAUDE.md`, modified `.gitignore`, new files under `.claude/hooks/`, `.claude/commands/`, `.claude/settings.json`, and `docs/superpowers/specs/...` and `docs/superpowers/plans/...`.

- [ ] **Step 13.3: Show the user a summary and ask for commit**

Tell the user:

> "All 11 files are in place:
> - 1 modified: `CLAUDE.md` (added Hard Rules + 28-domain Manifest)
> - 1 modified: `.gitignore` (ignored hook tracker state)
> - 1 created: `.claude/settings.json` (hook wiring)
> - 5 created: `.claude/hooks/` (touched-files-track.mjs, no-auto-commit.mjs, doc-sync.mjs, lib/manifest.mjs, lib/match.mjs)
> - 3 created: `.claude/commands/` (doc-bootstrap.md, doc-domain.md, doc-sync.md)
> - 1 created: `docs/superpowers/specs/2026-04-28-codebase-documentation-system-design.md`
> - 1 created: `docs/superpowers/plans/2026-04-28-codebase-documentation-system.md`
>
> Suggested commit messages (you decide whether to do as one commit or split):
> - `docs(superpowers): add codebase documentation system spec + plan`
> - `feat(claude): add hard rules section + Domain Manifest to CLAUDE.md`
> - `feat(.claude): add doc-sync, no-auto-commit hooks and slash commands`
>
> How would you like to commit? (one big commit, three split commits, or skip for now?)"

Wait for explicit user response before any `git commit`.

---

## Task 14: Smoke test the live system

**Files:** none (verification only)

- [ ] **Step 14.1: Confirm hooks are NOT yet active in this session**

Hooks load from `settings.json` at session start. Tell the user:

> "Hooks are wired up but won't activate until you start a fresh Claude Code session. To test:
>
> 1. Close this Claude Code session.
> 2. Open a new one in the same project.
> 3. Try editing any file under `src/services/subscription/`.
> 4. Try saying `commit this` — the no-auto-commit hook should let it through.
> 5. Try saying anything that doesn't authorize commits, then ask Claude to commit — the hook should block.
> 6. Try editing a `src/` file and then ending the turn without updating any `docs/` file — the doc-sync hook should block with a 'STALE DOCS' message.
>
> Want me to walk you through that, or are you good to test on your own?"

---

## Self-Review

Spec coverage check (sections in spec → tasks in plan):

| Spec section | Plan coverage |
|---|---|
| §1 Problem | (n/a — narrative) |
| §2 Goals | All addressed by Tasks 1–12 |
| §3 Non-goals | Honored (no per-file docs, no AST, no library docs) |
| §4 Architecture (4 components) | Task 1 (CLAUDE.md), Tasks 6-8 (hooks), Tasks 10-12 (commands) |
| §5 Domain Inventory (28 domains) | Task 2 (manifest) |
| §6 Per-domain template | Task 10 (doc-bootstrap describes it) |
| §7 Manifest format | Task 2 (JSON instead of YAML — noted) |
| §8 Auto-update flow | Tasks 6 + 8 (PostToolUse + Stop) |
| §9 Slash commands | Tasks 10, 11, 12 |
| §10 No-auto-commit | Task 1 (rule) + Task 7 (hook) |
| §11 File deliverables | Tasks 1–12 cover all 9 files (plus 2 helper libs) |
| §12 Implementation order | Plan tasks follow this order |
| §13 Risks | Addressed: trivia filter (Task 8), recursion guard (Task 8 step 8.4), hook soft-fail on errors (Task 8 main()) |

**Placeholder scan:** searched for "TBD", "TODO", "later", "appropriate" — none found in implementation code (only inside the slash-command bodies as legitimate `_TODO: verify._` placeholder text for the docs themselves, which is correct).

**Type/name consistency:**
- `readManifest` / `bumpLastVerified` / `findDomain` / `matchesAny` / `globToRegex` — all defined and consistently referenced.
- `.claude/.touched-files` path used identically in PostToolUse hook (Task 6) and Stop hook (Task 8).
- `<!-- DOMAIN-MANIFEST-START -->` / `<!-- DOMAIN-MANIFEST-END -->` markers — used identically in Task 2 (insertion), Task 4 (parser), Task 11/12 (commands reference).
- Hook command paths in `settings.json` (Task 9) match actual file locations created in Tasks 6, 7, 8.

**Manifest ↔ spec alignment:** All 28 domains from spec §5 appear in the manifest in Task 2, with correct `docs:` paths matching `docs/<domain>/`.

No issues found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-codebase-documentation-system.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because tasks are independent and the user wants to review between commits anyway.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
