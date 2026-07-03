# Design: URL param to default the membership section to One-Time packs

**Date:** 2026-07-03
**Status:** Approved approach, pending spec review
**Domain:** subscription (`docs/subscription/`)

## Problem

Ads run to the `/promotions/*` landing pages as the conversion link. The membership
section on those pages defaults to the **Membership Packs** (subscription) tab. For
one-time-focused ad creatives we want the landing URL to pre-select the **One-Time** tab,
e.g. `/promotions/makita?packages=one-time`, so the visitor sees one-time packages first —
while still being able to toggle back to Membership Packs manually.

The param must also work on any other page that renders the same toggle-based section
(home, shop, etc.), because the section is shared.

## Confirmed decisions

1. **Param shape:** `?packages=one-time` — keyed and validated.
   - `packages` matches the section's own identifier (`<section id="packages">`).
   - `one-time` / `membership` are the existing canonical `activeTab` tokens — no new vocabulary.
   - Default (`membership`) is expressed by **omitting** the param, keeping organic URLs clean
     (mirrors the `?toolbox=` convention where Milwaukee omits the param).
   - Rejected: a bare `?one-time-packs` marker (no precedent, coins a synonym, not extensible).
2. **Scope:** honored wherever the toggle-based section renders (control arm on ~15 pages) **and**
   the `/promotions` A/B **treatment** arm, so behavior is A/B-bucket-agnostic. The redesigned
   `/membership` page uses a drawer (no toggle) — **out of scope** (param is a no-op there).
3. **First paint:** read on the **client** via `useSearchParams`. A brief membership→one-time
   flip after hydration is accepted — it is identical to how the section already flips for
   subscribers today. No server-component plumbing.
4. **Persistence:** the param **stays in the URL** (survives refresh/back, like `?toolbox=`),
   and rides along on toolset/toolbox navigation because the existing href builders already
   preserve the full query string. Not stripped after load.

## Why this is not a band-aid

- The "forced tab" concept is centralized in **one** parser, consumed by the two existing
  state owners. We do not add new duplicated logic — we thread one shared concept through the
  duplication that already exists by design (the hook intentionally mirrors the component;
  unifying them is explicitly out of scope per its own comment and the repo's no-refactor rule).
- Every user path is handled (see matrix), not just the happy logged-out path.
- Vocabulary reuses existing tokens; the param mirrors an existing, working precedent (`?toolbox=`).

## The `activeTab` owners (why each must seed from the param)

The toggle state `activeTab: "membership" | "one-time"` is decided in independent places,
and `PromoPackages.tsx:18` selects which packages arm renders at runtime from the live A/B experiment:

| Owner | File | Where the default is decided |
|-------|------|------------------------------|
| Control packages arm (~15 pages incl. `/promotions` control) | `src/components/sections/MembershipSection.tsx` | `useState("membership")` + override `useEffect` |
| Treatment packages arm (`/promotions` treatment) + `/membership` | `src/hooks/useMembershipCardCta.ts` | `useState(...)` initializer |
| **Promo multiplier banner** (`/promotions`) | `src/components/sections/promo/PromoBanner.tsx` | `useState("membership")` + `membershipTabChanged` event listener |

An ad landing on `/promotions/makita` can hit **either** packages arm, so both must honor the param or
the feature silently works for only some visitors.

**Third owner found during review:** `PromoBanner` independently mirrors the tab (for its multiplier
badge) and defaulted to `"membership"`, syncing only via the `membershipTabChanged` window event. Seeding
it from the param directly (rather than dispatching the event on mount from `MembershipSection`) avoids a
race where the banner's listener may not be registered when a mount-time dispatch fires — the two live in
different subtrees separated by a Suspense boundary. So all three owners **seed from the shared parser**;
the event bus is retained only for post-load manual toggles.

## Design

### 1. New shared parser (one file)

`src/utils/membership/packagesTabParam.ts` — covered by the existing `src/utils/membership/**`
subscription-domain glob (no manifest edit needed).

```ts
/** Query key that pre-selects the membership section's packages tab, e.g. `?packages=one-time`. */
export const MEMBERSHIP_PACKAGES_QUERY_PARAM = "packages";

/**
 * Parses `?packages=`. Invalid/absent → null (caller falls back to its normal default).
 * Returns the canonical activeTab tokens; does not introduce a new type alias.
 */
export function parseMembershipPackagesTab(
  raw: string | null | undefined,
): "membership" | "one-time" | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  return v === "one-time" || v === "membership" ? v : null;
}
```

### 2. Control arm — `src/components/sections/MembershipSection.tsx`

- Add `const searchParams = useSearchParams();` (imported from `next/navigation`, the same module
  the component already imports `usePathname` from — add the named import if not already present).
- `const forcedPackagesTab = parseMembershipPackagesTab(searchParams.get(MEMBERSHIP_PACKAGES_QUERY_PARAM));`
- Seed initial state (L69): `useState(forcedPackagesTab ?? "membership")`.
- Guard the override effect (L141-159): early-return when `forcedPackagesTab` is set, so user
  state cannot clobber the URL choice (and so a later `userData` change won't fight a manual toggle).
  Add `forcedPackagesTab` to the dep array.
- Add a one-shot mount effect: if `forcedPackagesTab` is set, dispatch the existing
  `membershipTabChanged` CustomEvent once so `PromoBanner`'s multiplier badge syncs to the
  pre-selected tab.

### 3. Treatment arm — `src/hooks/useMembershipCardCta.ts`

- Add optional `forcedTab?: "membership" | "one-time" | null` to the options object (which
  already carries `includeAdditionalForMembers`).
- Seed the initializer (L89-91):
  `useState(forcedTab ?? (hasActiveSubscription && hasAccessToAdditional ? "one-time" : "membership"))`.
- No effect guard needed — this hook has no override effect; the initializer is the only decision point.
- `/membership` (`MembershipPageClient`) calls the hook without `forcedTab`, so it is untouched.

### 4. Treatment consumer — `src/components/sections/promo/PromoMembershipDesign.tsx`

- Read `const forcedTab = parseMembershipPackagesTab(useSearchParams().get(MEMBERSHIP_PACKAGES_QUERY_PARAM));`
  (this component is rendered inside the Suspense-wrapped `PromoPackages`, so the read is safe).
- Pass it in: `useMembershipCardCta({ includeAdditionalForMembers: true, forcedTab })`.

### 4b. Promo banner — `src/components/sections/promo/PromoBanner.tsx`

- In the existing mount effect, read the param via `new URLSearchParams(window.location.search)` + the shared
  parser and `setActiveTab` to the forced value, so the multiplier badge matches a forced landing.
- Use `window.location.search`, **not** `useSearchParams()`: `PromoBanner` renders **outside** the promo
  pages' `<Suspense>` boundaries, so `useSearchParams()` would de-opt the statically-generated routes (build
  error / banner pop-in). The client-only effect keeps the banner server-rendered with the `"membership"`
  default and applies the param post-mount (no hydration mismatch).
- Keep the existing `membershipTabChanged` listener for post-load manual toggles. Do **not** add a
  mount-time dispatch in `MembershipSection` — it would race the banner's listener registration across the
  Suspense boundary.

### 5. Docs

Update `docs/subscription/` (frontend) to document the `?packages=` param, its values, scope,
and the effect-guard behavior. Required by the doc-sync Stop hook.

## User-path matrix (all must be correct)

| Visitor | `?packages=one-time` present | Result |
|---------|------------------------------|--------|
| Guest (main ad audience) | yes | Seed = one-time; override effect never fires (`userData` null) → sticks. ✓ |
| Logged-in non-subscriber | yes | Seed = one-time; effect would reset to membership → **guard prevents it**. ✓ |
| Logged-in subscriber w/ additional access | yes | User-state default is already one-time; param agrees / harmless. ✓ |
| Any visitor, then clicks toggle | yes | Manual `setActiveTab` still works; guarded effect won't snap back. ✓ |
| Any visitor | absent / `?packages=membership` | Normal existing behavior; clean canonical URL. ✓ |
| Any visitor | `?packages=garbage` | Parser → null → normal default. ✓ |

## Edge cases & interactions

- **PromoBanner multiplier sync:** covered by the mount-dispatch of `membershipTabChanged`.
- **SSR/hydration:** `useSearchParams` is already used in `MembershipSection` (deep-link hook) and
  in the Suspense-wrapped `PromoPackages` subtree — no new boundary risk on the static promo pages.
- **Deep-link co-existence:** `?openMembership=1&packageId=…` (`useMembershipModalDeepLink`) is
  orthogonal and can appear on the same URL as `?packages=one-time`.
- **Param persistence across navigation:** `buildToolsetLandingHref` / `buildPromotionsToolsetLandingHref`
  already carry the full query string, so `packages` rides along automatically — no builder edits.
- **No regression to non-forced behavior:** every guard/branch is gated on `forcedPackagesTab` being
  present, so the absent-param path is byte-for-byte the current behavior.

## Out of scope

- Unifying the two `activeTab` owners (`MembershipSection` vs `useMembershipCardCta`) — deliberate
  duplication; no-refactor rule applies.
- Auto-opening the `/membership` one-time drawer — different UI, not the ad target.
- Server-side computed initial tab (zero-flash) — rejected in Decision #3.

## Verification plan

- `npm run type-check` and `npm run lint`.
- Manual: load `/promotions/makita?packages=one-time` logged-out → One-Time tab shown first,
  banner multiplier matches one-time; toggle back to Membership works. Repeat logged-in
  (non-subscriber). Load without the param → Membership default unchanged. `?packages=garbage`
  → Membership default.
- If the A/B packages-design experiment is live, verify both control and treatment arms honor it.
- Confirm doc-sync + no-auto-commit hooks are satisfied (docs updated; no commit without authorization).
