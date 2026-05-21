# Dashboard + Tier-Picker Polish Design Spec

_Date: 2026-05-21 · Domain: `subscription` (+ touches `dashboard-account`, `cart-shop-products`) · Scope: **UI polish, single small schema-adjacent helper, no math change, no new endpoints**_

Follow-up to the resubscribe and upgrade rounds (commits `31be5759`, `54b7a73b`, `6bebdcd9`, `7c0e1756`, `52384634`). Addresses six user-flagged issues after browser-testing the tier picker:

1. The tier picker looks too soft — it should match the existing membership-section visual scheme (gradient backgrounds, package icons, multiplier badge image).
2. The wording "carry-over" is wrong; should read "accumulated entries" everywhere it surfaces.
3. The settings page back button currently navigates browser-history previous; should hard-route to `/my-account`.
4. The `/my-account` dashboard "TOTAL ENTRIES" cards (Membership / One-time) need an animated empty state so first-time visitors notice them; persisted per browser tab.
5. The active-member "current plan" hero in settings should include the projected next-renewal entry count.
6. The activity-tab resubscribe sub-line from Phase 3 (commit `52384634`) is visual noise and should be removed entirely.

## 1. Tier-card visual refresh

### 1.1 Premise

The current `ResubscribeTierPicker` cards (shipped in `6bebdcd9`) are flat white/gradient cards. The existing `ElectricPackageCard` ([src/components/sections/membership/ElectricPackageCard.tsx](src/components/sections/membership/ElectricPackageCard.tsx)) — used on `/membership`, upgrade flows, and the cancellation flow — has a distinctive look: dark gradient backgrounds per tier (cyan for Tradie, yellow for Foreman, red for Boss), package icon top-left, multiplier badge image top-right, large glowing entry number, themed light/dark variants. The picker needs to match that look so the cancelled-user flow feels native to the rest of the membership UI.

### 1.2 Approach (option B — new compact card)

Create `src/components/modals/SubscriptionManagementModal/ResubscribeTierCard.tsx`. New compact card that mirrors `ElectricPackageCard`'s visual primitives but exposes only the slots the resubscribe context needs.

**Props:**

```ts
interface ResubscribeTierCardProps {
  plan: ResubscribeTierOption;          // existing type from ResubscribeTierPicker
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  isPrevious: boolean;
  theme?: "light" | "dark";             // mirror ElectricPackageCard's switch
  onSelect: (packageId: string) => void;
}
```

**Reused primitives (imported, not copied):**
- `getMembershipSectionColorScheme(plan.packageId, true)` from `@/utils/package-colors/packageColorScheme` for `bgGradient`, `accentHex`, `text`, `textGradientStyle`.
- `getPackageIcon(plan.packageId)` from `@/utils/images/package-icons` returning a `StaticImageData` for `next/image`.
- `PromoBadgeImage` from `@/components/ui/PromoBadgeImage` for the `X{N}.webp` badge when `promoMultiplier > 1`.
- `cn` utility from `@/utils/cn`.

**Visual contract:**
- Outer card: `rounded-3xl` + the scheme's `bgGradient` + `overflow-visible` + the same `boxShadow` recipe `ElectricPackageCard` uses (tier-accent glow on dark, soft drop-shadow on light).
- Top-left: 48×48 package icon (`Image` from `next/image`, `width=48 height=48`, `priority={false}`).
- Top-right: `PromoBadgeImage size="small"` only when `promoMultiplier > 1`.
- Body row 1: tier name as `<h3>` (with `(previously)` suffix in muted text when `isPrevious`), price chip `${price}/mo` right-aligned.
- Body row 2 (large): "Sign-up grant" label + the `entriesPerMonth × promoMultiplier` number rendered with the same `textShadow: 0 0 18px ${accent}, 0 0 36px ${accent}80` glow `ElectricPackageCard` uses on dark.
- Body row 3: "Accumulated entries: X" (the `lastMonthAccumulatedEntries`) in smaller muted text.
- Body row 4: "Next renewal: Y" where `Y = lastMonthAccumulatedEntries + (entriesPerMonth × promoMultiplier) + entriesPerMonth`.
- Whole card is a `<button type="button">` for click+keyboard a11y.
- Hover effect: `transform: scale(1.02)` when interactive.

**Theme switch:** mirror `ElectricPackageCard`'s logic — same `isLight` variable, same color overrides for the big-number text on light backgrounds. Used inside the settings panel (light theme on light backgrounds, dark theme everywhere else).

**Trade-off accepted:** some style duplication between `ResubscribeTierCard` and `ElectricPackageCard`. The carry-over context is sufficiently different from the "Enter Now" / "Upgrade to X" framing that mixing the two via optional props would muddy `ElectricPackageCard`'s consumers (membership section, upgrade modal, cancellation flow). Keeping them separate is the leaner answer.

### 1.3 Replace usage in `ResubscribeTierPicker`

In [src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx](src/components/modals/SubscriptionManagementModal/ResubscribeTierPicker.tsx), swap the inline `<button>` mapping for `<ResubscribeTierCard ... />`. The picker keeps responsibility for layout (header + grid), each card owns its visuals.

The `ResubscribeEmptyState` wrapper stays — same outer styled container, same footer note. The `ResubscribeEmptyStateFallback` stays as a defensive guard when no packages load.

## 2. Wording: "carry-over" → "accumulated entries"

Display copy only. Internal field name stays `lastMonthAccumulatedEntries`.

| Surface | Current | New |
|---|---|---|
| Picker subheader | "Your **150** accumulated entries carry over." | "You have **150** accumulated entries." |
| Tier card body row 3 | "Your carry-over: 150" | "Accumulated entries: 150" |
| Tier card body row 4 | "Next renewal: 240" | unchanged |
| Picker fallback bottom note | "...your entries history is preserved." | unchanged |
| Success-page banner | "Your previous **150** accumulated entries carried over." | "Your **150** accumulated entries carried over." |
| Activity-tab sub-line | "Includes resubscribe + carry-over from previous membership..." | **removed entirely** — see §6 |

## 3. Settings back-button hard route to `/my-account`

### 3.1 Where

The back chevron is rendered by [src/app/(site)/my-account/components/DashboardHeader.tsx](src/app/(site)/my-account/components/DashboardHeader.tsx) (line ~60, `<ArrowLeft>` icon). It already accepts an optional `onBackClick` callback prop ("When provided, called instead of router.back()"), with default behavior being `router.back()` at line ~43.

### 3.2 Change

In [src/app/(site)/my-account/settings/page.tsx](src/app/(site)/my-account/settings/page.tsx), pass a custom handler to `DashboardHeader` that calls `router.push("/my-account")`:

```tsx
<DashboardHeader
  ...
  onBackClick={() => router.push("/my-account")}
/>
```

No change to `DashboardHeader` itself — the callback hook is already in place. The default `router.back()` continues to apply to other surfaces (my-account → my-account/draws drill-down etc.) that don't pass the override.

## 4. Empty-card animation on `/my-account`

### 4.1 Surface

The "TOTAL ENTRIES" tiles on the dashboard — Membership card (red) and One-time card (green) — live in [src/app/(site)/my-account/components/MajorDrawOverview.tsx](src/app/(site)/my-account/components/MajorDrawOverview.tsx) (same component the §6 cleanup targets). User's screenshot showed these with values; the new behavior animates them only when empty.

### 4.2 Triggers

| Card | Empty condition | Click target |
|---|---|---|
| Membership | `!user.subscription?.isActive` (cancelled, expired, or never subscribed) | `router.push("/my-account/settings?tab=subscription")` |
| One-time | No active one-time entries — `(displayOneTimeEntries ?? 0) === 0` | Open existing `MembershipModal` (already wired in surrounding code; use the same handler) |

### 4.3 Animation style

| Card | Effect | Duration | Detail |
|---|---|---|---|
| Membership | Soft pulse + glow | 3s ease infinite | Border/ring color cycles between base and tier-accent glow; opacity micro-cycle ~0.95 → 1.0 |
| One-time | Shimmer sweep | 4s ease infinite | Diagonal `linear-gradient` mask sweeps left → right across the card surface |

Both wrapped in `@media (prefers-reduced-motion: no-preference)`. Users with the OS setting see the static card; click still works.

### 4.4 Persistence

New helper `src/utils/dashboard-empty-card-nudge.ts`:

```ts
const KEY_BASE = "ta:dashboard-card-nudge-clicked:v1";

export type NudgeCardType = "membership" | "onetime";

function key(cardType: NudgeCardType): string {
  return `${KEY_BASE}:${cardType}`;
}

export function hasClickedNudge(cardType: NudgeCardType): boolean {
  try {
    return sessionStorage.getItem(key(cardType)) === "1";
  } catch {
    return false;
  }
}

export function markNudgeClicked(cardType: NudgeCardType): void {
  try {
    sessionStorage.setItem(key(cardType), "1");
  } catch {
    /* sessionStorage unavailable (private browsing, etc.) — silently ignore */
  }
}
```

**Behavior:**
- Card mounts → reads `hasClickedNudge(cardType)`.
- If `false` AND the empty condition is true → render the animated variant.
- On click → calls `markNudgeClicked(cardType)` before `router.push` / modal open.
- Fresh tab → fresh nudge (sessionStorage scope).
- Refresh → fresh nudge (sessionStorage is per-tab but cleared by some browsers on refresh; either way acceptable for this use).

**`:v1:` segment:** lets us reset everyone's flag in the future by bumping to `:v2:` without renaming the public API.

**Defensive fallback:** when `sessionStorage` throws (private-browsing edge case), helper returns `false` / no-ops. Animation always renders; no client-side error.

## 5. Active-member hero: next-renewal entries

### 5.1 Where

The "current plan" hero inside the active-member branch of [SettingsRedesignSubscription.tsx](src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx). The hero already shows tier name, started date, next billing date.

### 5.2 Addition

Add one line immediately under "Next billing":

> **Next renewal entries:** **1,165**

### 5.3 Computation

```ts
const baseEntries = subscriptionPackageData?.entriesPerMonth;
const lastMonthAccumulated = (user.subscription as { lastMonthAccumulatedEntries?: number } | undefined)
  ?.lastMonthAccumulatedEntries;

const nextRenewalEntries = (lastMonthAccumulated ?? baseEntries ?? 0) + (baseEntries ?? 0);
const showRenewalEntries = typeof baseEntries === "number" && baseEntries > 0;
```

Mirrors `calculateRenewalEntries` ([src/utils/payment/subscription-entries-calculator.ts:99](src/utils/payment/subscription-entries-calculator.ts#L99)) exactly. If `lastMonthAccumulatedEntries` is missing, falls back to `baseEntries` per the calculator's stated fallback.

### 5.4 Conditional render

If `showRenewalEntries === false` (no `entriesPerMonth` on the package) → hide the line entirely. Don't render "NaN" or "—".

For `past_due` users → still show the line; it's their next-renewal projection and useful even while payment is failing.

## 6. Remove activity-tab resubscribe sub-line

### 6.1 What to delete

The line *"Includes resubscribe + carry-over from previous membership. Next month's renewal will use your new accumulated total."* below the TOTAL ENTRIES card in the dashboard. Added in commit `52384634` (resubscribe Phase 3).

### 6.2 Scope

In [src/app/(site)/my-account/components/MajorDrawOverview.tsx](src/app/(site)/my-account/components/MajorDrawOverview.tsx):

- Remove the `activationDate?: string` prop addition.
- Remove the `lastResubscribedAt?: string | Date` extension on the `userSubscription` prop shape.
- Remove the `drawIncludesResubscribe` boolean derivation.
- Remove the conditional `<p>...</p>` sub-line JSX.

In [src/app/(site)/my-account/page.tsx](src/app/(site)/my-account/page.tsx):

- Drop the `activationDate={currentMajorDraw?.activationDate}` prop.
- Revert the `userSubscription` cast extension that added `lastResubscribedAt?: string | Date`. Keep `lastMonthAccumulatedEntries?: number` (it predates Phase 3).

### 6.3 What stays

- `User.subscription.lastResubscribedAt` schema field — the success-page banner still depends on it (the 10-minute `wasRecentResubscribe` window in `/api/payment-status/[paymentIntentId]`).
- The resubscribe write site in `create-subscription-existing-user/route.ts` — keeps writing the timestamp.
- The success-page banner copy — unchanged behavior, only its wording shifts (per §2).

### 6.4 Docs follow-up

Remove the "Resubscribe carry-over sub-line on `MajorDrawOverview`" section from `docs/dashboard-account/frontend.md`. Add a one-line note explaining the feature was reverted.

## 7. Inactive-state simplification

### 7.1 Branch logic (inside the settings subscription tab)

Replace the existing 3-branch state derivation in [EmptyStates.tsx](src/components/modals/SubscriptionManagementModal/EmptyStates.tsx) with:

```
if subscription is active                     → active-member hero (with §5 addition)
else if subscription.status === "past_due"    → existing recovery flow (UNTOUCHED)
else                                          → tier picker (universal)
```

The "else" branch covers: `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, never subscribed. All show the picker.

### 7.2 Delete

- `InactiveSubscriptionState` `status !== "canceled"` branch (the yellow AlertTriangle + "Subscription Inactive" + "Subscribe to Membership Packages" CTA card). Removed from `EmptyStates.tsx`.
- Audit other usages of `InactiveSubscriptionState` at implementation time. If only used by the subscription tab and the surfaces this spec covers, the export can be removed entirely; otherwise leave it for other callers.

### 7.3 Picker context-aware copy

The picker subheader adapts to the user state:

| State | Subheader |
|---|---|
| Cancelled, `lastMonthAccumulatedEntries > 0` | "You have **{N}** accumulated entries." |
| Cancelled, accumulated = 0 | "Pick a tier to come back." |
| Never subscribed (`!user.subscription`) | (no subheader) |

The footer note ("Your subscription was cancelled. Pick any tier...") renders only for the cancelled case.

The header copy stays "Welcome back — pick a tier" for cancelled users, and switches to "Pick a tier to get started" for never-subscribed.

## 8. Out of scope

- No backend changes. No new API endpoints. No new Mongo fields.
- No change to `calculateRenewalEntries`, `calculateResubscribeEntries`, `calculateUpgradeEntries`, or the dispatcher.
- No animation on the active-state cards (only the empty state animates).
- No new feature flags. No A/B test scaffolding.
- The `past_due` recovery flow inside the settings subscription tab is untouched.
- The `ResubscribeEmptyStateFallback` is preserved as a defensive guard.

## 9. Domain manifest

Files this spec touches are already covered by existing manifest entries:

- `src/components/modals/SubscriptionManagementModal/**` — falls under `shared-ui` per `src/components/modals/**` glob (known cosmetic mismatch — flagged in earlier reviews; the domain that semantically owns it is `subscription`, but the manifest doesn't list it explicitly).
- `src/utils/dashboard-empty-card-nudge.ts` — `shared-ui` via `src/utils/common/**`? No — `src/utils/common/**` only catches specific files. This new util belongs under `dashboard-account` semantically. Will add `src/utils/dashboard-empty-card-nudge.ts` to the `dashboard-account` domain `paths` in CLAUDE.md if it isn't auto-matched.
- `src/app/(site)/my-account/**` — `dashboard-account`. Covered.
- `src/app/(site)/purchase-success/**` — `cart-shop-products`. Covered.
- `src/components/sections/membership/**`, `src/utils/package-colors/**`, `src/utils/images/**` — read-only references; no edits required to these.

## 10. Phase plan

**Phase 1 — Tier card visual refresh + copy** (largest visual win):
- Create `ResubscribeTierCard`.
- Replace usage inside `ResubscribeTierPicker`.
- Apply the §2 wording rewrites across picker, banner, fallback.
- Update `docs/subscription/` accordingly.

**Phase 2 — Inactive-state simplification + universal picker** (delete legacy, widen branch):
- §7 branch-logic rewrite in `EmptyStates.tsx`.
- Picker context-aware subheader (§7.3).
- Remove `InactiveSubscriptionState` `status !== "canceled"` branch.
- Update `docs/subscription/`.

**Phase 3 — Active-member hero renewal entries** (§5):
- Add the line in `SettingsRedesignSubscription.tsx`.
- Update `docs/subscription/`.

**Phase 4 — Dashboard empty-card animations** (§4):
- Create `src/utils/dashboard-empty-card-nudge.ts`.
- Locate and modify the "TOTAL ENTRIES" component.
- Wire animation CSS (Tailwind keyframes or inline styles, depending on existing patterns in `globals.css`).
- Update `docs/dashboard-account/`.

**Phase 5 — Settings back button + activity-tab cleanup** (§3 + §6):
- Locate the settings back button source; hard-route to `/my-account`.
- Remove the activity-tab sub-line per §6.
- Update `docs/dashboard-account/`.

Phases 1–3 directly improve the resubscribe flow (the user-visible flagged issue). Phase 4 is a separate UX nudge. Phase 5 is cleanup.
