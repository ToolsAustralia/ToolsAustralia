# Member Dashboard Revamp — Spec 1: Foundation Shell + Dashboard Home — Design

**Date:** 2026-07-02
**Branch:** `feature/user-dashboard-revamp`
**Status:** Design proposed (pending spec review) → next: implementation plan
**Design source:** `claudeDesign/Tools Australia — Membership & Partner Rewards Redesign/design_handoff_rewards_dashboard/` (hi-fi Claude prototype; primary ref `rewards-concepts.js`).

## Context

The Claude prototype is a **5-destination member dashboard + 3 overlays** (Dashboard home,
Rewards, Draws, Membership, Settings + Support/Payment/Manage overlays). It is far larger than the
single-page `/membership` job, so it is **decomposed into sequenced sub-projects on a shared
foundation**, each with its own spec → plan → build cycle. **This is Spec 1 of that set** and covers
the **shared foundation shell + the Dashboard home** (the flagship destination). It is organized
exactly like the approved `/membership` redesign (`docs/superpowers/specs/2026-06-29-membership-page-redesign-design.md`):
file-per-section under `src/components/sections/<area>/`, thin client composer, reuse of existing
hooks/primitives, "recompose don't delete".

### Sub-project sequence (for reference — only Spec 1 is in scope here)

1. **Foundation shell + Dashboard home** ← this spec
2. Rewards (`benefits/`) — partners-first → claimables → milestones
3. Draws — major/mini toggle, prize picker, how-it-works, winners, mini-draw entries
4. Membership (`my-account/membership/`) — current plan, tier list, one-time packs, Manage overlay
5. Settings + overlays — Appearance/ThemePicker, responsive Support/Payment/Manage sheet↔modal

## Goal

Port the prototype's **home dashboard** onto the live codebase pixel-faithfully, wired to **real
data where it exists**, and stand up the **cross-cutting shell** (nav model, desktop sidebar, token
mapping, tier/state theming, coming-soon visibility switches) that every later destination builds on.
This is a **recompose-and-uplift**, not greenfield — much of `my-account/**` already exists on `main`
in an older/partial visual state.

## Decisions (locked with the user)

1. **Scope = Foundation shell + Dashboard home only** in this spec; the other four destinations are
   separate specs. Accuracy/fidelity is paramount.
2. **Theme = Light/Dark only. No "System" mode.** The design's 3-way ThemePicker becomes a 2-way.
   This honors the codebase's earlier deliberate removal of System (`ThemeContext` supports only
   `"light" | "dark"`; `ta-theme` key + boot-script already match). The ThemePicker itself ships in
   the **Settings** sub-project; the foundation keeps a theme control reachable so nothing regresses
   before then.
3. **Coming-soon = built-but-hidden.** Features with no backend yet are **fully built in code** and
   mounted behind **off-by-default visibility switches** in one small module
   (`src/config/dashboardFeatures.ts`), so a future Claude session flips a single flag to surface the
   finished UI. This is a **named requirement** (user wants to enable them later), so a minimal
   centralized switch earns its place over CLAUDE.md §4 "no feature flags by default" — it is a
   visibility map, not flag infrastructure.
4. **New section components live under `src/components/sections/dashboard/`** (mirror `/membership`),
   composed by a thin client. Not the handoff's literal `my-account/components/*` mapping.
5. **Dead code = flag only.** Delete nothing this spec; the user reviews the flagged list first.
6. **File layout / routes reuse existing vocabulary.** Route paths unchanged (`/my-account`,
   `/my-account/benefits`, …); nav **labels** follow the design ("Rewards" labels the existing
   `benefits/` route). One concept, one name (CLAUDE.md global rule).

## Non-goals

- No changes to Stripe/subscription machinery, the entry-flow/gating hooks, the A/B framework, or
  tracking — only **new callers** of existing hooks.
- No new business facts. Same tiers/prices/entries/access %/promo model/draw cadence → **BUSINESS.md
  and README assertions do not change**. (If the doc-sync hook trips a BUSINESS trigger glob on a
  pure-visual edit, make a one-line clarifying touch to clear it.)
- No overlays (`SheetShell` sheet↔modal) — deferred to the Settings/overlays sub-project. The home
  opens no sheets (Support stays its existing route until then).
- No redesign of the other four destinations; their shared components stay intact.

## Cross-cutting systems (foundation)

### Account states (4) — derive once, trace real control flow

`useDashboardState` (new hook) resolves exactly one `acct` and threads it + tier + theme + multiplier
+ entries to every section. **CLAUDE.md §6 footgun:** derive each state from the real helpers, not
from names/prior assumptions — trace the code:

| State | Source (verify in code) | Header treatment |
|---|---|---|
| `pastdue` | `hasFailedRenewal(user)` / `subscription.status === "past_due"` (`src/utils/subscription/subscription-helpers.ts`) | amber gradient, PAUSED pill, alert ribbon, "Update payment to resume"; claims disabled |
| `active` (member) | `user.subscription?.isActive === true` and not past-due | tier-color gradient, access ring, streak, Reward-portal CTA |
| `onetime` | no active subscription **but** an active one-time pack (`getActivePackage(user).source === "one-time"` / `enrichedOneTimePackages[].isActive`) | teal gradient, **time-gated** access ring (days/hrs left), "Make it permanent" upsell |
| `none` | no active subscription **and** no active one-time pack | neutral gradient, entries 0, **dual CTA** (Become a member **+** Buy a package) |

Header ink auto-adjusts via `inkOn()` (`tier-visuals.ts`): white on red/blue/dark, dark on gold.

### Tier & state theming

- **Owned-package recolor** (hero background) reuses the established dashboard path:
  `derivePlanIdFromPackage(activePackage.packageData, source)` → `getLandingPageThemeFromPlanId(planId)`
  (`src/utils/package-colors/packageColorScheme.ts`), same as the current `page.tsx`/`benefits`.
- **Fixed tier cards / chips** use the lean `tier-visuals.ts` (`glossGrad(hex)` + `inkOn` + `shade`,
  `TIER_HEX`).
- **4 state header gradients** (member=tier · onetime=teal `#0ea5a5` · pastdue=amber · none=neutral)
  centralized in a small new helper `src/utils/dashboard/dashboard-state-theme.ts` (pure; returns
  `{ gradient, ink, accent }` from `acct` + tier theme). One concept, one name.

### Navigation model

| id | label | route | icon |
|---|---|---|---|
| `overview` | Dashboard | `/my-account` | Grid |
| `rewards` | Rewards | `/my-account/benefits` | Gift |
| `draws` | Draws (raised center) | `/my-account/draws` | Ticket |
| `account-membership` | Membership | `/my-account/membership` | Card |
| `support` | Support | `/my-account/support` | Chat |

- **Mobile:** rewrite `my-account/components/BottomNav.tsx` to these 5 (Draws = raised center FAB,
  red gradient), active = red + ring. Settings via **gear** (in the hero), not a nav slot.
- **Desktop:** new `my-account/components/DeskNav.tsx` (236px sidebar): TA logomark + same 5 items +
  footer monogram/name/email/gear → Settings. Mounted by the shell for `lg:` and up.
- **Shell:** grow `my-account/layout.tsx` into a responsive frame (bottom nav mobile / sidebar +
  `--maxw` content desktop). Keeps the existing `data-account-layout` site-chrome opt-out.

### Coming-soon visibility switches

`src/config/dashboardFeatures.ts` — a typed, off-by-default map. Fully-built UI mounts behind these;
a future session flips one to `true`.

```ts
export const DASHBOARD_FEATURES = {
  cobberSupport: false,     // AI support assistant (Support overlay, later sub-project)
  milestoneProgress: false, // milestone-progress bars (no customer-facing read yet)
  personalWins: false,      // "your wins" history (only global winners endpoint today)
  orderHistory: false,      // full purchase history (only last-10 `recentOrders` today)
} as const;
```

## Dashboard home — composition (`src/components/sections/dashboard/`)

Light-first, `dark:` pairs per house convention; desktop two-column (1.7 / 1) via a layout wrapper
inside the responsive composition (no mobile/desktop component duplication). `page.tsx` stays the
client orchestrator (keeps its existing setup/upsell/subscription-explainer modal triggers) and
composes the sections; heavy modal-trigger logic may be extracted to a `useDashboardModals` hook
(optional, slims `page.tsx`).

| # | Section (file) | Build | Data / wiring |
|---|---|---|---|
| 1 | **DashboardHero** | NEW | `Monogram` + greeting + tier chip + `AccessRing` (member) / countdown ring (onetime, via `getPartnerDiscountAccessInfo`) / paused pill (pastdue) / dual-CTA (none); gear→Settings; **Reward portal** btn → `usePartnerDiscountSso()`. State recolor from owned-package theme. |
| 2 | **EntryWallet** | NEW — **carved out of `MajorDrawOverview`** | `useUserMajorDrawStats` + `useDashboardEntryDisplay`: eyebrow "Entries · {draw} draw", big `total`, split bar (membership vs one-time) via `EntryProgressBar`, legend, "Draw closes in" d/h/m via `useLeafTimer` off `/api/major-draw` `drawDate`. Pending-renewal + projection reuse current `page.tsx` derivation. |
| 3 | **DashboardPromoBanner** | REUSE/extend `sections/promo/PromoBanner` (add compact `variant="dashboard"`; only add a new file if layouts are irreconcilable) | `useResolvedMultiplier(...,"display")`: gold 1–3× / hot 5–10× palette escalation; heading "50% off one-time packages"; "{n}× free entries"; 🔥{n}× badge on "Get a package" → entry flow. |
| 4 | **LoyaltyStreak** | NEW | months from real member-since (`insights.memberSince` / subscription start); 6-seg track; pastdue "at risk" amber variant. The **milestone unlock** line renders behind `milestoneProgress` (coming-soon) — until then, static known-reward copy only, no fabricated progress. |
| 5 | **QuickActionsGrid** | NEW (`QuickTile` in `ui/`, `TileGrid` local) | tiles: Packages (multiplier badge), Redeem (count from `useRedeemablesWallet`, gated by `rewardsEnabled()`), Vouchers*, Refer (+100 → `ReferFriendModal`), Past Draws (`PastDrawsModal`), Milestones*, Partners (→ Rewards), Support. *Vouchers/Milestones behind coming-soon flags. 44px+ targets. |
| 6 | **PartnerPreview** | NEW shell + reuse `PartnerDiscountQueue` / `UnlockDiscounts` data | mini partner-discounts card + "See all" → `/my-account/benefits`. Disabled/greyed when `pastdue`; time-gated copy when `onetime`. |
| 7 | **DashboardGuestPanel** | NEW (`acct === "none"`) | "Enter the {draw} draw" card with **dual CTA** (Become a member **+** Buy a package) + "what members get" + explore tiles. Never gates everything behind membership. |

Forbidden promo copy (design rule): never "boost odds" / "increase chance" / "50% off extra
entries". Correct: "50% off one-time packages", "free entries".

## Data wiring & gap handling (never fabricated)

**Available live (wire it):** identity/profile, active package/tier (`getActivePackage` +
`getEffectiveBenefits`), subscription status + `hasFailedRenewal`, tier theme (`packageColorScheme`),
major-draw overview (`useCurrentMajorDraw`) + user entry breakdown (`useUserMajorDrawStats`,
`useDashboardEntryDisplay`), promo multiplier (`useResolvedMultiplier`), partner access + queue +
portal SSO (`benefit-resolution`, `usePartnerDiscountQueue`, `usePartnerDiscountSso`), redeemables
wallet (`useRedeemablesWallet`, gated by `rewardsGuard`), saved payment methods, winners social proof.

| Gap | Handling |
|---|---|
| **Milestone progress** (no customer-facing read) | build the streak/milestone UI behind `milestoneProgress=false`; until enabled, show current months + static known reward copy, **no progress %** |
| **Rewards program paused** (`rewardsEnabled()` can 503) | Redeem/streak/claimables read `rewardsEnabled()`; when paused, show the tile in a neutral disabled state (no error) |
| **Personal wins / full order history** | built behind `personalWins` / `orderHistory` = false (data-layer audit: only global winners + last-10 orders exist) |
| **Cobber AI support** | Support tile routes to existing support page; Cobber card built behind `cobberSupport=false` (Support overlay sub-project) |
| **One-time partner-access countdown** | real remaining window from `getPartnerDiscountAccessInfo`; if unavailable, show access % without a countdown (no invented "days left") |
| **Dead mini-draw entry hooks** | do **not** wire `useUserMiniDrawEntries`/`useEnterMiniDraw`/etc. (routes don't exist); N/A on home anyway |

## Architecture

- `src/app/(site)/my-account/layout.tsx` — grown into the responsive **DashboardShell** (bottom nav
  + desktop `DeskNav` + framed content); keeps `data-account-layout` opt-out.
- `src/app/(site)/my-account/page.tsx` — stays the client orchestrator (existing modal triggers +
  guards); **composes** the new sections; visual JSX moves out. Optional `useDashboardModals` extract.
- `src/app/(site)/my-account/components/` — **BottomNav.tsx** (rewritten) + **DeskNav.tsx** (new).
- **New sections** under `src/components/sections/dashboard/`: `DashboardHero`, `EntryWallet`,
  `DashboardPromoBanner` (or extend existing `PromoBanner`), `LoyaltyStreak`, `QuickActionsGrid`,
  `PartnerPreview`, `DashboardGuestPanel`.
- **New shared primitives (only where none exists)** in `src/components/ui/`: `Monogram` (extract;
  refactor `MembershipWinnersWall`'s inline `initials()` to use it), `QuickTile`.
- **New helper:** `src/utils/dashboard/dashboard-state-theme.ts`; **new hook:** `src/hooks/useDashboardState.ts`.
- **New config:** `src/config/dashboardFeatures.ts`.
- **Reuse:** `AccessRing`, `Seg`, `AnimatedNumber`, `MetallicButton`, `Button`, `Badge`, `Card`,
  `EntryProgressBar`, `MembershipBadge`, `CountdownLeaf`/`useLeafTimer`, `PromoBadge`/
  `MultiplierBannerImage`, `SectionContainer`, `tier-visuals.ts`, `packageColorScheme.ts`,
  `MembershipModal`, `useMajorDrawEntryCta`, `useMajorDrawPurchaseGate`, `useMemberships`,
  `useResolvedMultiplier`, `useRedeemablesWallet`, partner SSO/queue hooks, `ReferFriendModal`,
  `PastDrawsModal`.
- **Styling:** Tailwind + `cva` + `cn()`; `globals.css` semantic tokens (`bg-page`, `bg-surface`,
  `text-primary-token`, `text-muted-token`, `border-token`); tier hexes from `tier-visuals`; promo
  hot gradients as utilities; honor `prefers-reduced-motion` everywhere; `.num` tabular figures on
  every counter.
- **Layering:** no DB/API in components; data via hooks; `page.tsx`/`layout.tsx` thin. **Register all
  new files in the Domain Manifest** (`dashboard-account` for `my-account/**` + new `src/utils/dashboard/**`
  + `src/hooks/useDashboardState.ts`; `shared-ui` for `src/components/sections/dashboard/**` +
  `src/components/ui/**`; `config-and-data` for `src/config/**`) and update the matching `docs/<domain>/`
  in the same task (doc-sync Stop hook). No admin routes touched → no Norm lockstep.

## Flagged for deletion — DO NOT delete in this work (hand to user)

Mirrored as a top-of-file comment block in the new `page.tsx`, like `MembershipPageClient`.

- 🚩 **Genuinely dead (0 JSX usages) — recommend removal in a review pass:**
  `src/app/(site)/my-account/components/MembershipStatus.tsx`,
  `ActivePrizeDraws.tsx`, `RecentOrders.tsx`, the empty `EntryWallet.tsx` stub (superseded by the new
  section), and the stale re-exports in `components/index.ts`.
- **Superseded on home but KEPT** (still used by sub-pages until those are redesigned — do NOT delete):
  `DashboardHeader.tsx`, `CoverBanner.tsx`, `UserInfoBar.tsx`, old `QuickActions.tsx`,
  `SocialLinksSection.tsx`. Dropped from the home composition only.
- **`MajorDrawOverview.tsx`** — entries-wallet logic **extracted** into the new `EntryWallet`; its
  countdown/major-draw-hero role migrates to the **Draws** sub-project. Keep until then.
- **`MembershipPackagesChart`** — already flagged by the membership spec; fully orphaned once
  `my-account/membership` is redesigned (sub-project 4).

## Risks

- **`MajorDrawOverview` extraction (highest):** the 649-line component owns entries display,
  projections, pending-renewal, badges, accumulation tooltips. Carving a clean `EntryWallet` must
  preserve every state (active/onetime/pastdue/none, failed-renewal amber, projection, pending). Trace
  each path; verify end-to-end, not just the member happy path (CLAUDE.md §6).
- **Account-state derivation:** four states from real helpers — assert each in code before branching.
- **Theme-control regression:** removing `HeaderThemeToggle` from the new hero before the Settings
  ThemePicker exists would strip theme switching. Keep a control reachable (sidebar footer / retain
  toggle) until sub-project 5.
- **Doc-sync / BUSINESS triggers:** editing `my-account/**` trips the doc-sync Stop hook; update the
  relevant `docs/<domain>/`. No business facts change.
- **Promo copy compliance:** the banner must use the allowed wording only.

## Verification

- `npm run type-check`, `npm run lint`.
- Manual: drive all **four account states** (member / one-time / past-due / none) through the home —
  hero recolor + CTA, entries wallet split-bar + countdown, promo banner off/2×/5×/10×, loyalty
  streak (incl. pastdue "at risk"), quick actions, partner preview; guest dual-CTA panel; reduced
  motion; light + dark; mobile bottom nav + desktop sidebar.
- Confirm coming-soon slots are hidden with flags `false` and render correctly when flipped `true`.
- Visual parity against the prototype (`ConceptHub` mobile + `ConceptHubDesktop`).
