# User Dashboard Revamp — Spec 1: Foundation Shell + Dashboard Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Claude prototype's member-dashboard **home** onto the live codebase and stand up the shared **foundation shell** (nav model, desktop sidebar, tier/state theming, coming-soon visibility switches) that every later destination reuses.

**Architecture:** File-per-section under `src/components/sections/dashboard/`, composed by the existing `my-account/page.tsx` client orchestrator; a single `useDashboardState` hook derives account-state / tier / theme / multiplier / entries and threads them to dumb section components; the responsive shell (mobile bottom nav + desktop sidebar) lives in `my-account/layout.tsx`. Mirrors the approved `/membership` redesign pattern exactly.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind + `cva` + `cn()`, TanStack Query, existing hooks (`useMyAccountData`, `useUserMajorDrawStats`, `useDashboardEntryDisplay`, `useResolvedMultiplier`, `useRedeemablesWallet`, partner SSO/queue), existing primitives (`AccessRing`, `Seg`, `AnimatedNumber`, `MetallicButton`, `EntryProgressBar`, `tier-visuals.ts`, `packageColorScheme.ts`), `tsx` test scripts for logic.

## Global Constraints

- **Theme:** Light/Dark only — **no "System" mode**. `ThemeContext` type stays `"light" | "dark"`.
- **Coming-soon = built but hidden** behind `src/config/dashboardFeatures.ts` off-by-default switches (`cobberSupport`, `milestoneProgress`, `personalWins`, `orderHistory`). Never render live when `false`.
- **Promo copy (allowed only):** "50% off one-time packages", "free entries", "{n}× free entries on every package". **Forbidden:** "boost odds", "increase chance", "50% off extra entries".
- **Semantic tokens:** `bg-page`, `bg-surface`, `text-primary-token`, `text-muted-token`, `border-token`; tier hexes from `tier-visuals.ts` `TIER_HEX`; `.num` (tabular figures) on every counter; honor `prefers-reduced-motion`; ship `dark:` pairs (light-first).
- **Layering:** no DB/API in components; data via hooks; `page.tsx`/`layout.tsx` thin. One concept, one name (reuse existing vocabulary; CLAUDE.md global rule).
- **Verify real control flow before branching on state** (CLAUDE.md §6). **Strict subagent scope** (CLAUDE.md §7).
- **Commits allowed, no push.** Commit per task. **No UI/feature bugs** — verify every account state (active/onetime/pastdue/none) + light/dark + mobile/desktop.
- **Recompose, don't delete.** Flag dead code; delete nothing (user reviews first).
- **Docs:** register new files in the Domain Manifest + update `docs/<domain>/` (doc-sync Stop hook). No business-fact change → BUSINESS.md/README unchanged (clarifying touch only if a trigger glob trips).

---

## File Structure

**New:**
- `src/config/dashboardFeatures.ts` — coming-soon visibility switches (config-and-data).
- `src/utils/dashboard/dashboard-state-theme.ts` — pure `acct (+tierHex) → {gradient, ink, accent}` (dashboard-account).
- `src/utils/dashboard/derive-dashboard-account-state.ts` — pure account-state machine (dashboard-account).
- `src/utils/dashboard/__tests__/dashboard-state-theme.test.ts`, `.../derive-dashboard-account-state.test.ts` — `tsx` tests.
- `src/hooks/useDashboardState.ts` — composes hooks + the two pure helpers (dashboard-account).
- `src/hooks/useDashboardModals.ts` — extracted modal orchestration from current `page.tsx` (dashboard-account).
- `src/components/ui/Monogram.tsx` — shared monogram tile (shared-ui).
- `src/components/ui/QuickTile.tsx` — glossy icon tile (shared-ui).
- `src/app/(site)/my-account/components/DeskNav.tsx` — desktop sidebar (dashboard-account).
- `src/components/sections/dashboard/{DashboardHero,EntryWallet,LoyaltyStreak,QuickActionsGrid,PartnerPreview,DashboardGuestPanel}.tsx` (shared-ui).

**Modified:**
- `src/app/(site)/my-account/components/BottomNav.tsx` — rewrite to the 5-item design nav.
- `src/app/(site)/my-account/layout.tsx` — responsive shell (bottom nav + desktop sidebar + frame).
- `src/components/sections/promo/PromoBanner.tsx` — add compact `variant="dashboard"` (only add a new file if irreconcilable).
- `src/app/(site)/my-account/page.tsx` — recompose to the new sections; modal logic via `useDashboardModals`.
- `src/components/sections/membership/MembershipWinnersWall.tsx` — swap inline `initials()` for shared `Monogram`.
- `CLAUDE.md` Domain Manifest + `docs/dashboard-account/`, `docs/shared-ui/`, `docs/config-and-data/`.

**Flagged for deletion — DO NOT delete (mirror in `page.tsx` header comment):** `MembershipStatus.tsx`, `ActivePrizeDraws.tsx`, `RecentOrders.tsx`, empty `EntryWallet.tsx` stub, stale `components/index.ts` re-exports; superseded-but-kept: `DashboardHeader`, `CoverBanner`, `UserInfoBar`, old `QuickActions`, `SocialLinksSection`; `MajorDrawOverview` (wallet extracted, rest → Draws sub-project).

---

## Task 1: Coming-soon switches + state-theme helper (pure, TDD)

**Files:**
- Create: `src/config/dashboardFeatures.ts`
- Create: `src/utils/dashboard/dashboard-state-theme.ts`
- Test: `src/utils/dashboard/__tests__/dashboard-state-theme.test.ts`

**Interfaces:**
- Produces: `DASHBOARD_FEATURES` (const map); `type DashboardAccountState = "active"|"onetime"|"pastdue"|"none"`; `getDashboardStateTheme(acct: DashboardAccountState, tierHex?: string|null): { gradient: string; ink: string; accent: string }`.
- Consumes: `shade`, `inkOn` from `src/utils/membership/tier-visuals.ts`.

- [ ] **Step 1: Write `dashboardFeatures.ts`**

```ts
/**
 * Dashboard feature-visibility switches. Coming-soon UI is fully built but
 * mounted behind these; flip to `true` (in a later session) to surface it.
 * Keep OFF by default. This is a visibility map, not flag infrastructure.
 */
export const DASHBOARD_FEATURES = {
  cobberSupport: false, // AI support assistant (Support overlay sub-project)
  milestoneProgress: false, // milestone-progress bars (no customer-facing read yet)
  personalWins: false, // "your wins" history (only global winners endpoint today)
  orderHistory: false, // full purchase history (only last-10 recentOrders today)
} as const;

export type DashboardFeature = keyof typeof DASHBOARD_FEATURES;
export const isDashboardFeatureOn = (f: DashboardFeature): boolean => DASHBOARD_FEATURES[f];
```

- [ ] **Step 2: Write the failing test for `getDashboardStateTheme`**

```ts
// src/utils/dashboard/__tests__/dashboard-state-theme.test.ts
import assert from "node:assert";
import { getDashboardStateTheme } from "../dashboard-state-theme";

// active member with a light tier (foreman gold) → dark ink
const foreman = getDashboardStateTheme("active", "#ffd200");
assert.ok(foreman.gradient.includes("157deg"), "active gradient uses 157deg");
assert.strictEqual(foreman.ink, "#0a0a0a", "gold tier → dark ink");
assert.strictEqual(foreman.accent, "#ffd200");

// active member with a dark tier (boss red) → white ink
const boss = getDashboardStateTheme("active", "#ee0000");
assert.strictEqual(boss.ink, "#ffffff", "red tier → white ink");

// non-member states are fixed palettes, white ink
for (const s of ["onetime", "pastdue", "none"] as const) {
  const t = getDashboardStateTheme(s);
  assert.ok(t.gradient.startsWith("linear-gradient"), `${s} has a gradient`);
  assert.strictEqual(t.ink, "#ffffff", `${s} → white ink`);
}
assert.ok(getDashboardStateTheme("onetime").accent === "#0ea5a5", "onetime accent = teal");

console.log("dashboard-state-theme: PASS");
```

- [ ] **Step 3: Run to verify it fails** — Run: `npx tsx src/utils/dashboard/__tests__/dashboard-state-theme.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `dashboard-state-theme.ts`**

```ts
import { shade, inkOn } from "@/utils/membership/tier-visuals";

export type DashboardAccountState = "active" | "onetime" | "pastdue" | "none";

export interface DashboardStateTheme {
  gradient: string;
  ink: string;
  accent: string;
}

// Fixed non-member header gradients (match the prototype ConceptHub headers).
const FIXED: Record<Exclude<DashboardAccountState, "active">, DashboardStateTheme> = {
  onetime: { gradient: "linear-gradient(157deg,#0f4d4d,#0a2e2e 56%,#124a52)", ink: "#ffffff", accent: "#0ea5a5" },
  pastdue: { gradient: "linear-gradient(157deg,#3a2410,#1c1410 55%,#2a1c10)", ink: "#ffffff", accent: "#d97706" },
  none: { gradient: "linear-gradient(157deg,#26262b,#161619 60%,#202027)", ink: "#ffffff", accent: "#737373" },
};

/** Header background/ink/accent for the dashboard hero by account state. */
export function getDashboardStateTheme(
  acct: DashboardAccountState,
  tierHex?: string | null,
): DashboardStateTheme {
  if (acct !== "active") return FIXED[acct];
  const hex = tierHex ?? "#ee0000";
  // Rich 157deg tier gradient: darker edges, base mid.
  const gradient = `linear-gradient(157deg, ${shade(hex, -8)}, ${shade(hex, -42)} 60%, ${shade(hex, -22)})`;
  return { gradient, ink: inkOn(hex), accent: hex };
}
```

- [ ] **Step 5: Run to verify it passes** — Run: `npx tsx src/utils/dashboard/__tests__/dashboard-state-theme.test.ts` — Expected: `dashboard-state-theme: PASS`.

- [ ] **Step 6: Add `test:dashboard-state-theme` to `package.json`** scripts: `"test:dashboard-state-theme": "tsx src/utils/dashboard/__tests__/dashboard-state-theme.test.ts"`.

- [ ] **Step 7: Commit** — `git add src/config/dashboardFeatures.ts src/utils/dashboard/ package.json && git commit -m "feat(dashboard): coming-soon switches + state-theme helper"`

---

## Task 2: Account-state machine + `useDashboardState` (TDD on the pure part)

**Files:**
- Create: `src/utils/dashboard/derive-dashboard-account-state.ts`
- Test: `src/utils/dashboard/__tests__/derive-dashboard-account-state.test.ts`
- Create: `src/hooks/useDashboardState.ts`

**Interfaces:**
- Produces: `deriveDashboardAccountState(input): DashboardAccountState`; `useDashboardState(): DashboardStateResult`.
- Consumes: `hasFailedRenewal` (`@/utils/subscription/subscription-helpers`), `getActivePackage` (`@/utils/membership/get-active-package`), `tierKeyFromName`/`TIER_HEX` (`@/utils/membership/tier-visuals`), `getDashboardStateTheme` (Task 1), `useMyAccountData`, `useUserMajorDrawStats`, `useCurrentMajorDraw`, `useDashboardEntryDisplay`, `useResolvedMultiplier`.

**⚠️ CLAUDE.md §6:** before writing `deriveDashboardAccountState`, open `get-active-package.ts` and `subscription-helpers.ts` and confirm: `subscription.isActive === true` ⇒ member; `hasFailedRenewal(user)` ⇒ past-due; `getActivePackage(user).source === "one-time" && .isActive` ⇒ one-time. Do not infer from names.

- [ ] **Step 1: Write the failing test**

```ts
// derive-dashboard-account-state.test.ts
import assert from "node:assert";
import { deriveDashboardAccountState } from "../derive-dashboard-account-state";

const base = { hasActiveMembership: false, isPastDue: false, hasActiveOneTime: false };
assert.strictEqual(deriveDashboardAccountState({ ...base }), "none");
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveMembership: true }), "active");
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveOneTime: true }), "onetime");
// past-due dominates even for an otherwise-active member
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveMembership: true, isPastDue: true }), "pastdue");
// one-time holder that is also past-due on a lapsed sub → pastdue wins
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveOneTime: true, isPastDue: true }), "pastdue");
console.log("derive-dashboard-account-state: PASS");
```

- [ ] **Step 2: Run to verify it fails** — `npx tsx src/utils/dashboard/__tests__/derive-dashboard-account-state.test.ts` → FAIL.

- [ ] **Step 3: Implement the pure state machine**

```ts
// derive-dashboard-account-state.ts
import type { DashboardAccountState } from "./dashboard-state-theme";

export interface DashboardAccountStateInput {
  hasActiveMembership: boolean;
  isPastDue: boolean;
  hasActiveOneTime: boolean;
}

/** Precedence: pastdue > active > onetime > none. */
export function deriveDashboardAccountState(i: DashboardAccountStateInput): DashboardAccountState {
  if (i.isPastDue) return "pastdue";
  if (i.hasActiveMembership) return "active";
  if (i.hasActiveOneTime) return "onetime";
  return "none";
}
```

- [ ] **Step 4: Run to verify it passes** — Expected `... PASS`. Add `test:dashboard-account-state` to `package.json`.

- [ ] **Step 5: Implement `useDashboardState.ts`** — composes cached queries (TanStack dedupes) + the two pure helpers. Returns `{ acct, tierKey, tierHex, stateTheme, multiplier, entries:{total,membership,oneTime}, partnerAccessPct, streakMonths, isPastDue, user, currentMajorDraw }`. Derive `hasActiveMembership = user?.subscription?.isActive === true`; `isPastDue = hasFailedRenewal(user)`; `hasActiveOneTime = getActivePackage(user).source === "one-time" && getActivePackage(user).isActive`; `tierKey = tierKeyFromName(activePackage.packageData?.name)`; `multiplier = useResolvedMultiplier("membership-packages","display")`; entries from `useDashboardEntryDisplay(useUserMajorDrawStats(...))`. Guard for loading/no-session (return `acct:"none"` skeleton-safe defaults).

- [ ] **Step 6: `npm run type-check`** — Expected: clean.

- [ ] **Step 7: Commit** — `git add src/utils/dashboard src/hooks/useDashboardState.ts package.json && git commit -m "feat(dashboard): account-state machine + useDashboardState hook"`

---

## Task 3: Shared primitives — `Monogram` + `QuickTile`

**Files:**
- Create: `src/components/ui/Monogram.tsx`, `src/components/ui/QuickTile.tsx`
- Modify: `src/components/sections/membership/MembershipWinnersWall.tsx` (use `Monogram`)

**Interfaces:**
- Produces: `<Monogram firstName lastName size? radius? tierHex? onBrand? className/>` → initials tile (white tile + tier ink when `onBrand`, else `glossGrad(tierHex)` fill + `inkOn` text); `<QuickTile icon label badge? accentHex? href?/onClick? disabled? comingSoon?/>` → 56px glossy icon tile, ≥44px target, optional red count badge, focus-visible ring.

- [ ] **Step 1: Implement `Monogram`** — reuse the `initials(first,last)` logic currently inline in `MembershipWinnersWall` (first letter of each, uppercase, fallback to first char of email/name). Use `glossGrad`/`inkOn` from `tier-visuals`. Poppins, tabular not needed.
- [ ] **Step 2: Implement `QuickTile`** — `cva` variants; renders `Link` when `href`, `button` otherwise; `comingSoon` shows a muted "Soon" pill and disables navigation; `prefers-reduced-motion` safe.
- [ ] **Step 3: Refactor `MembershipWinnersWall`** to import and render `<Monogram firstName={w.winnerFirstName} lastName={w.winnerLastName} onBrand tierHex={w.color}/>`, deleting its local `initials()`.
- [ ] **Step 4: `npm run type-check && npm run lint`** — clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): shared Monogram + QuickTile; dedupe winners-wall initials"`

---

## Task 4: Navigation shell — `BottomNav` rewrite + `DeskNav` + responsive `layout.tsx`

**Files:**
- Modify: `src/app/(site)/my-account/components/BottomNav.tsx`
- Create: `src/app/(site)/my-account/components/DeskNav.tsx`
- Modify: `src/app/(site)/my-account/layout.tsx`

**Interfaces:**
- Shared nav model constant `DASHBOARD_NAV` (id/label/href/icon) exported from `BottomNav.tsx` and consumed by `DeskNav`. Items: Dashboard `/my-account` (Grid/LayoutDashboard), Rewards `/my-account/benefits` (Gift), Draws `/my-account/draws` (Ticket, raised center), Membership `/my-account/membership` (CreditCard), Support `/my-account/support` (MessageCircle). Active = `usePathname()` exact for `/my-account`, `startsWith` for others.

- [ ] **Step 1: Rewrite `BottomNav`** — 5 items from `DASHBOARD_NAV`; Draws index-2 raised center FAB (red gradient, elevated); active item red + ring; `lg:hidden`; `pb-[env(safe-area-inset-bottom)]`; icons from `lucide-react`; ≥44px targets; focus-visible red ring.
- [ ] **Step 2: Implement `DeskNav`** (desktop sidebar, `hidden lg:flex`, 236px, sticky) — TA logomark header; `DASHBOARD_NAV` items (active state); footer = `<Monogram/>` + name + email + gear `Link` → `/my-account/settings`. Consumes `useSession`/`useMyAccountData` for footer identity (or accepts `firstName/lastName/email` props passed from layout — prefer props to keep it dumb; layout provides them).
- [ ] **Step 3: Grow `layout.tsx`** into the responsive shell: `lg:` two-pane (`<DeskNav/>` + framed `<main class="max-w-[1180px] ...">`), mobile single-column with `<BottomNav/>`; keep `data-account-layout` opt-out; keep `pb-16 lg:pb-0`. Fetch identity for `DeskNav` via `useMyAccountData(session.user.id)` (cached).
- [ ] **Step 4: Verify** — `npm run type-check && npm run lint`; manually load `/my-account`, `/my-account/benefits`, `/my-account/draws`, `/my-account/membership`, `/my-account/support` and confirm active states + that the desktop sidebar appears ≥`lg` and bottom nav <`lg`, no overlap/CLS.
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): responsive nav shell — bottom nav rewrite + desktop sidebar"`

---

## Task 5: `EntryWallet` — carve from `MajorDrawOverview` (highest risk)

**Files:**
- Create: `src/components/sections/dashboard/EntryWallet.tsx`

**Interfaces:**
- `<EntryWallet acct entries={{total,membership,oneTime}} tierHex drawName drawDateIso drawStatus pending? projection? onResolvePayment?/>` — presentational; consumes derived values from `useDashboardState` (passed by the composer).

**⚠️ Read `MajorDrawOverview.tsx` in full first.** Preserve every state it renders: normal totals, **pending-renewal** (projected total swap), **failed-renewal** amber + "resolve payment", empty/nudge states, one-time vs membership split, completed-draw zeroing.

- [ ] **Step 1: Build the wallet card** — eyebrow "Entries · {drawName}", big `AnimatedNumber` total (`.num`); split bar via `EntryProgressBar` (membership in `tierHex`, one-time in `--good`); legend ("Membership {n|paused|—}", "One-time packs {n}"); hairline; "Draw closes in" d/h/m via `useLeafTimer(drawDateIso)`. State branches: `pastdue` → membership legend "paused" + amber "Update payment" (`onResolvePayment`); `onetime` → membership "—"; completed draw → zeroed + "Drawn" label.
- [ ] **Step 2: Pending/projection** — when `pending`, show projected total (alternate/annotate) mirroring `MajorDrawOverview`'s behavior; reuse `MonthProjectionTooltip` if applicable.
- [ ] **Step 3: Verify** — `npm run type-check && npm run lint`; render each `acct` + pending + completed; confirm numbers match `MajorDrawOverview` for the same inputs (no double counting).
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): EntryWallet section (extracted from MajorDrawOverview)"`

---

## Task 6: `DashboardHero`

**Files:** Create `src/components/sections/dashboard/DashboardHero.tsx`

**Interfaces:** `<DashboardHero acct name tierKey tierLabel stateTheme partnerAccessPct partnerAccessExpiryLabel? onOpenSettings onRewardPortal onPrimaryCta/>`.

- [ ] **Step 1: Build the hero header** — background `stateTheme.gradient`, ink `stateTheme.ink`; decor (gold seam + subtle hatch/glow via existing `DiagonalPatternOverlay` if suitable, else CSS); row: `<Monogram onBrand/>` + greeting ("Good evening, {name}"; guest "Welcome,") + gear button (`onOpenSettings`) + state-right element:
  - `active` → `<AccessRing pct={partnerAccessPct}/>` "Access"
  - `onetime` → white `<AccessRing/>` + "{expiry} left"
  - `pastdue` → amber "Past due" pill
  - `none` → none
- [ ] **Step 2: Second row (chips + primary CTA)** — `active` = crown+tier chip + "Reward portal" (`onRewardPortal` → partner SSO); `pastdue` = "{tier} · paused" chip + "Update payment"; `onetime` = "One-time pack" chip + "Become a member"; `none` = "Guest" chip + "Become a member". Ink forced readable via `stateTheme.ink`.
- [ ] **Step 3: Verify** — type-check, lint; all 4 states, gold-tier dark-ink contrast, light/dark.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): DashboardHero section"`

---

## Task 7: `DashboardPromoBanner` (extend existing `PromoBanner`)

**Files:** Modify `src/components/sections/promo/PromoBanner.tsx` (add compact `variant="dashboard"`); if irreconcilable, create `src/components/sections/dashboard/DashboardPromoBanner.tsx` and reuse its subparts.

**Interfaces:** `variant?: "default" | "dashboard"`; `multiplier` from `useResolvedMultiplier`; `onGetPackage`.

- [ ] **Step 1: Read existing `PromoBanner`**; add a compact dashboard layout (single card): palette escalation gold(1–3×)/hot(5–10×) — hot 10× `linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)`, 5× `…#ff6a3d,#e0245e 60%,#a1004b`; when active show top strip "🔥 Special promo" + "Ends in HH:MM:SS" (`useLeafTimer`/existing countdown); heading "50% off one-time packages"; subtitle "{n}× free entries on every package"; "Get a package" + 🔥{n}× badge. Respect forbidden-copy rule.
- [ ] **Step 2: Verify** — type-check, lint; render off/2×/3×/5×/10×; confirm only the palette escalates (layout constant).
- [ ] **Step 3: Commit** — `git commit -m "feat(promo): dashboard variant of PromoBanner"`

---

## Task 8: `LoyaltyStreak`

**Files:** Create `src/components/sections/dashboard/LoyaltyStreak.tsx`

**Interfaces:** `<LoyaltyStreak months acct/>`; gates the milestone-unlock line behind `isDashboardFeatureOn("milestoneProgress")`.

- [ ] **Step 1: Build the card** — chip (`pastdue ? "At risk" : "{months} months"`), 6-segment track (filled = `min(months,6)`); copy: when `milestoneProgress` ON → "+250 free entries unlock at 6 months — {6-months} to go. Keep your membership active." (pastdue variant "Reactivate to keep your streak"); when OFF → show months + streak only, **no fabricated progress/unlock number**. Hidden entirely for `none`/`onetime` (member perk).
- [ ] **Step 2: Verify** — type-check, lint; member/pastdue; flag on/off.
- [ ] **Step 3: Commit** — `git commit -m "feat(dashboard): LoyaltyStreak section (milestone progress gated coming-soon)"`

---

## Task 9: `QuickActionsGrid`

**Files:** Create `src/components/sections/dashboard/QuickActionsGrid.tsx`

**Interfaces:** `<QuickActionsGrid acct multiplier redeemCount onRefer onPastDraws/>` using `QuickTile`/local `TileGrid`.

- [ ] **Step 1: Build the grid** — tiles: Packages (badge = `multiplier>1 ? "{n}×" : "50% OFF"` → entry flow), Redeem (count badge from `useRedeemablesWallet`, disabled when `rewardsEnabled()===false`), Vouchers (`comingSoon` unless a real voucher surface exists — verify; default coming-soon), Refer ("+100" → `onRefer`), Past Draws (`onPastDraws`), Milestones (`comingSoon` via `milestoneProgress` flag), Partners (→ `/my-account/benefits`), Support (→ `/my-account/support`). 44px+ targets.
- [ ] **Step 2: Verify** — type-check, lint; badges correct per multiplier/redeemables; coming-soon tiles show "Soon" and don't navigate.
- [ ] **Step 3: Commit** — `git commit -m "feat(dashboard): QuickActionsGrid section"`

---

## Task 10: `PartnerPreview`

**Files:** Create `src/components/sections/dashboard/PartnerPreview.tsx`

**Interfaces:** `<PartnerPreview acct/>` — reuses partner data via existing `PartnerDiscountQueue`/`UnlockDiscounts` data path (do not re-fetch differently).

- [ ] **Step 1: Build the mini card** — heading + sub (onetime: "Access ends in {left}…"; else "Australia's top tool brands…"), "See all" → `/my-account/benefits`, 2 deal rows (reuse brand data). Greyed/disabled when `pastdue`.
- [ ] **Step 2: Verify** — type-check, lint; states.
- [ ] **Step 3: Commit** — `git commit -m "feat(dashboard): PartnerPreview section"`

---

## Task 11: `DashboardGuestPanel`

**Files:** Create `src/components/sections/dashboard/DashboardGuestPanel.tsx`

**Interfaces:** `<DashboardGuestPanel drawName onBecomeMember onBuyPackage/>` (rendered only when `acct === "none"`).

- [ ] **Step 1: Build** — "Enter the {drawName} draw" card with **dual CTA** (Become a member + Buy a package) + "Membership from $20/mo · packages from $10" + "What members get" (3 rows) + explore `TileGrid` (Membership, Partners, Past Draws, Support). Never gate everything behind membership.
- [ ] **Step 2: Verify** — type-check, lint.
- [ ] **Step 3: Commit** — `git commit -m "feat(dashboard): DashboardGuestPanel section"`

---

## Task 12: Compose — `useDashboardModals` + `page.tsx` recompose

**Files:**
- Create: `src/hooks/useDashboardModals.ts`
- Modify: `src/app/(site)/my-account/page.tsx`

- [ ] **Step 1: Extract `useDashboardModals`** — move the setup/upsell/subscription-explainer/refer-friend/past-draws/package-detail trigger logic verbatim out of the current `page.tsx` into a hook returning the modal open-state + handlers + the modal elements' props. **Preserve behavior exactly** (sessionStorage keys, landing orchestration, timing) — CLAUDE.md §6: trace every path.
- [ ] **Step 2: Recompose `page.tsx`** — top-of-file "Flagged for deletion — DO NOT delete" comment block; render (member/onetime/pastdue): `DashboardHero → EntryWallet → DashboardPromoBanner → LoyaltyStreak → QuickActionsGrid → PartnerPreview`; guest: `DashboardHero → DashboardGuestPanel`. Two-column on `lg:` (main 1.7 / aside 1: streak + quick actions aside). Keep loading/error/no-session guards + all modals (via `useDashboardModals`) + `RewardsFloatingWidget`. Feed sections from `useDashboardState()`.
- [ ] **Step 3: Verify** — `npm run type-check && npm run lint`; drive every account state end-to-end; confirm modals (setup, upsell, explainer, refer, past-draws, package-detail) still trigger identically; no console errors; light/dark; mobile/desktop.
- [ ] **Step 4: Commit** — `git commit -m "feat(dashboard): recompose home from new sections; extract useDashboardModals"`

---

## Task 13: Manifest + docs + verification sweep

**Files:** `CLAUDE.md` (Domain Manifest), `docs/dashboard-account/*`, `docs/shared-ui/*`, `docs/config-and-data/*`

- [ ] **Step 1: Register new paths** in the Domain Manifest — `src/utils/dashboard/**`, `src/hooks/useDashboardState.ts`, `src/hooks/useDashboardModals.ts` → `dashboard-account`; `src/components/sections/dashboard/**`, `src/components/ui/Monogram.tsx`, `src/components/ui/QuickTile.tsx` → `shared-ui`; `src/config/dashboardFeatures.ts` already under `config-and-data` (`src/config/**`).
- [ ] **Step 2: Update docs** — `docs/dashboard-account/` (architecture/frontend/patterns: new shell, state hook, sections, coming-soon switches, flagged deletions) + `docs/shared-ui/` (Monogram/QuickTile/dashboard sections) + `docs/config-and-data/` (dashboardFeatures).
- [ ] **Step 3: Full verify** — `npm run type-check`, `npm run lint`, run the two new `tsx` tests; adversarial diff-review (diff-reviewer subagent); fix findings.
- [ ] **Step 4: Commit** — `git commit -m "docs(dashboard): manifest + domain docs for foundation + home"`

---

## Self-Review (author checklist — completed)

- **Spec coverage:** shell (nav/sidebar/layout T4), theming (T1 state-theme, useDashboardState T2), coming-soon switches (T1, gated in T8/T9), hero (T6), entries wallet (T5), promo (T7), streak (T8), quick actions (T9), partner preview (T10), guest (T11), compose (T12), docs/manifest (T13) — all covered.
- **Placeholder scan:** none (visual JSX specified by behavior + prototype map + exact copy; logic tasks carry full code).
- **Type consistency:** `DashboardAccountState` defined in T1, consumed in T2+; `getDashboardStateTheme` signature stable; `DASHBOARD_NAV` shared T4; `Monogram`/`QuickTile` props stable T3→T6/T9.
- **Test reality:** repo has no UI runner → TDD applied to pure logic (T1/T2 `tsx` tests); visual tasks verified via type-check/lint/functional/diff-review per Global Constraints.
