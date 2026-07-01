# Design Spec — Promotions Package-Design A/B Test (`promo` vs `membership`)

- **Status:** Draft for review
- **Date:** 2026-07-01
- **Author:** DJ + Claude
- **Domain:** `ab-testing` (primary), touches `promo`, `subscription`, `shared-ui`
- **Depends on:** the `isMemberOnly → isAdditional` rename (already landed on this branch)

---

## 1. Goal

Run a clean, DB-driven A/B test on **all promotions pages** that compares two package-selection designs:

- **Control (`packages.design: "promo"`)** — the current promo package block: `MembershipSection` rendered inside `PromoPackages`. This is exactly what ships today; the control arm changes nothing.
- **Treatment (`packages.design: "membership"`)** — the `/membership` page's package design (the tier chooser + one-time-packs drawer, `MembershipTierChooser` → `MembershipOneTimePacks`), driven by a single `useMembershipCardCta()` instance owning one `MembershipModal`.

Success metric: **package purchase conversion**, measured per bucketed user. The winner's design later **replaces** the loser's code (documented runbook below), so the treatment must be a *complete, shippable* replacement — not a demo.

Non-goal: redesigning either package UI. We are testing which existing design converts better when placed on promo pages.

---

## 2. Verified foundation (read before implementing)

Every claim below was traced in code during design; cite these when writing the plan.

### 2.1 The single choke-point
Both promo route families render the **identical** subtree `…<VariantAssignmentWrapper><Suspense><PromoPackages/></Suspense></VariantAssignmentWrapper>`:

- Dynamic prize pages — `src/app/promotions/[slug]/page.tsx:202` (Server Component; `dynamicParams=false`, slugs from `listPrizes()`).
- Toolset/brand pages — `src/app/promotions/_components/ToolsetLandingPage.tsx:155`, shared by the 5 thin brand wrappers (`src/app/promotions/{ryobi,milwaukee,dewalt,makita,hikoki}/page.tsx`).

They do **not** diverge before `PromoPackages`, so **`PromoPackages.tsx` is the one place to branch control vs treatment.** `PromoPackages` already reads `variantConfig` from `useVariantContext()` (`src/components/sections/promo/PromoPackages.tsx:9`).

### 2.2 Experiment resolution & slug targeting
- `[slug]` pages resolve on the **prize slug** directly.
- Toolset pages resolve on **`getDefaultPrizeForToolsetSlug(toolsetSlug)`** = `{brand}-milwaukee` for all 5 brands (`ToolsetLandingPage.tsx:79`, `src/config/promo-landing-slugs.ts:93`). They do **not** resolve on the bare `dewalt`/`makita`/… slug.
- ⇒ **`slugTargets = listPrizes().map(p => p.slug)`** covers *both* families with no exclusions (each `{brand}-milwaukee` is a prize slug). This is the accurate expression of "all promo slugs."
- Server assignment is already wired on both mounts: `getServerVariantAssignment(experimentId, slug)` → `VariantAssignmentWrapper` `initial*` props → client `useVariantContext()`. No new wrapper needed.

### 2.3 Config contract (`VariantConfig`)
`src/models/ab-testing/Variant.ts:80` already has a `packages` sub-object (`displayOrder?`, `highlightPackage?`, `hidePackages?`). Adding `design?` is a **scalar on an already-spread key**:

- `mergeVariantConfig` spreads `packages: {...base.packages, ...variant.packages}` (`VariantConfigService.ts:59`) → **`packages.design` merges automatically, zero merge-plumbing changes.**
- `validateVariantConfig` is allow-by-omission (`VariantConfigService.ts:193`) → an unknown key passes but is unvalidated. We add **one enum branch** so a bad value is rejected at authoring time.
- `PromoPackages` passes `variantConfig.packages` to `MembershipSection` today; it will read `variantConfig.packages.design` to branch.

### 2.4 Metric & attribution — the authoritative path (critical)
There are **two coexisting metric systems** (mid-migration). Getting this right is the whole point of "accurate data":

| | **System A — authoritative** | **System B — legacy, being retired** |
|---|---|---|
| Service | `ExperimentMetricsService.getExperimentMetrics` → `computeExperimentMetrics` → Bayesian | `ExperimentAnalyticsService.getVariantMetrics` (chi-square) |
| Source | `VariantAssignment` (denominator) ⋈ `PaymentEvent` `BenefitsGranted` (numerator/revenue) | `ExperimentEvent` `conversion`/`purchase` rows (TTL ~30d) |
| Properties | refund-aware, renewals separated, **14-day** window, per-user | conversion rate = conversions / **pageViews** (different base) |
| Admin panel | "Result — user-level · Bayesian" (top) | "Statistical Significance" / "Winner" cards (footnoted "being retired") |

**Consequences for this experiment:**
1. **The primary metric needs ZERO new code.** System A attributes a purchase to the user's assigned variant purely from `VariantAssignment` + a `BenefitsGranted` `PaymentEvent` — it re-derives by `userId`, not even needing the `PaymentEvent` stamp for logged-in buyers. A bucketed user who buys within 14 days is counted automatically.
2. **Read the winner off the Bayesian / user-level panel.** The legacy chi-square card uses a pageViews denominator and is *not comparable*; ignore it. No winner is auto-declared — a human clicks "declare winner."
3. `package_cta_click` (System B `ExperimentEvent`) is **diagnostic only** — see §6, optional.

### 2.5 `/membership` treatment design — reusable, one caveat
- Self-contained: no page-level fetch; all data from static hooks + context. `MembershipTierChooser` (`src/components/sections/membership/MembershipTierChooser.tsx`) renders `MembershipOneTimePacks`.
- `useMembershipCardCta()` (`src/hooks/useMembershipCardCta.ts:54`) owns exactly one `MembershipModal` via `cta.membershipModal`; it is already `/promotions/[slug]`-aware (reads `promo_slug` from pathname).
- **All 6 required providers are present** on promo routes (root `<Providers>` at `src/app/providers.tsx`): `UserContext`, `QueryClientProvider`, `VariantProvider` (wraps the whole section), `Toast`, `LoadingContext`, and `PromoThemeStore` (global Zustand, no provider). **No runtime-crash risk, no extra wrapper.**
- ⚠️ **Caveat:** `useMembershipCardCta` filters `oneTimePlans` to `!raw.isAdditional` (`:96`) — the `/membership` design deliberately hides Additional packs. See §5.

---

## 3. Design overview

```
PromoPackages (client, single choke-point)
  reads variantConfig.packages.design from useVariantContext()
  ├─ "promo"  (default / absent) → <MembershipSection …/>   ← CONTROL, unchanged
  └─ "membership"                → <PromoMembershipDesign/>  ← TREATMENT (new)

PromoMembershipDesign (new "use client" wrapper — mirrors MembershipPageClient)
  const cta = useMembershipCardCta({ includeAdditionalForMembers: true })  // §5 Option A
  <SectionContainer>
    <MembershipTierChooser cta={cta} sectionIdSuffix="promo" />   // avoid dup id="membership"
  </SectionContainer>
  <MembershipModal isOpen … onClose … selectedPlan … onPlanChange … />  // from cta.membershipModal
```

Everything else — bucketing, server assignment, purchase attribution — reuses the existing infra untouched.

---

## 4. Changes by area

### 4.1 Config field (`packages.design`)
- `src/models/ab-testing/Variant.ts` — add to the `packages` object in `VariantConfig`:
  ```ts
  packages?: {
    displayOrder?: string[];
    highlightPackage?: string;
    hidePackages?: string[];
    /** A/B: which package DESIGN renders on promo pages.
     *  "promo" (default/absent) = current MembershipSection; "membership" = /membership tier+one-time design. */
    design?: "promo" | "membership";
  };
  ```
- `VariantConfigService.ts` — add one branch inside the existing `if (cfg.packages)` block, mirroring the `countdownMode` enum check:
  ```ts
  if (packages.design !== undefined && !["promo", "membership"].includes(packages.design as string)) {
    errors.push('Packages design must be "promo" or "membership"');
  }
  ```
  (No `mergeVariantConfig` change — scalar on the spread `packages` key. No `getDefaultConfig` change needed; absence = control.)
- Admin `VariantConfigEditor` — add a `design` selector so the value is editable in the UI (seed sets it, but keep the admin in sync so a human can flip/verify).

### 4.2 Branch point (`PromoPackages.tsx`)
Read `packagesConfig?.design` and branch. Control path is byte-for-byte the current render; treatment mounts the new wrapper. Both mount families inherit this automatically.

### 4.3 Treatment wrapper (`PromoMembershipDesign.tsx`, new)
- Location: `src/components/sections/promo/PromoMembershipDesign.tsx` (sits beside `PromoPackages`, matches the `sections/promo` layer).
- Mirrors `MembershipPageClient` (`src/app/(site)/membership/components/MembershipPageClient.tsx:31-51`): one `useMembershipCardCta()`, render the tier+one-time block, render one `MembershipModal` from `cta.membershipModal`.
- Reuse only the packages block (`MembershipTierChooser` + embedded `MembershipOneTimePacks`) — omit the `/membership` marketing chrome (hero, trust strip, winners wall) since the promo page already provides its own.
- **Duplicate-anchor fix:** `MembershipTierChooser` hardcodes `id="membership"` (`:150`). Add a small prop (e.g. `sectionId`/`sectionIdSuffix`) so the promo instance doesn't collide with any other `#membership` on the page. Minimal, backward-compatible (defaults to current id).

### 4.4 Hook parameterization for member parity (§5, Option A)
`useMembershipCardCta` is shared with the real `/membership` page and "recompose only — no edits to `MembershipSection`." Add an **opt-in, default-off** option so existing callers are unchanged:
```ts
useMembershipCardCta({ includeAdditionalForMembers = false } = {})
// when true AND the user has additional-package access, keep isAdditional packs in oneTimePlans
// (the existing member-aware isLocked machinery already gates them correctly for non-members)
```
Only `PromoMembershipDesign` passes `true`. `/membership` and all other callers keep today's behavior.

### 4.5 Seed script (straight to active — explicitly authorized)
- File: `scripts/seed-promo-packages-design-experiment.ts`, modeled on `scripts/seed-variation1-vs-variation2-experiment.ts`.
- **Seeds `status: "active"`** with `startDate: now` (both existing seeds create `draft`; this is a deliberate, user-authorized deviation — call it out in the file header).
- `slugTargets = listPrizes().map(p => p.slug)` (covers both mount families; §2.2).
- Two variants, 50/50: control `{ packages: { design: "promo" } }` (`isControl: true`), treatment `{ packages: { design: "membership" } }`.
- `createdBy` = an existing admin user (required; same guard as the reference seed).
- **Idempotent + safe:** if the named experiment exists and is not `draft`/newly-created, skip (never clobber an admin-edited or live experiment). `--dry-run` default-friendly; `--force` only recreates variants on a draft (never touches active).
- **Overlap guard (new, important):** before activating, query for any **other** active experiment whose `slugTargets` intersect ours. `getActiveExperimentForSlug` returns one experiment per slug, so an overlap would make one test silently shadow the other. If overlap is found, **refuse to activate** and print the conflicting experiment id/name (require `--force-overlap` to proceed knowingly).
- npm entries: `seed:promo-packages-design` and `seed:promo-packages-design:dry`.

---

## 5. Key decision — member offer parity (DECIDED: Option A)

**The confound:** guests/non-members see identical public packs in both arms (clean). But **members** (active subscription OR current major-draw entries — `hasAdditionalPackageAccess`) see different *offers*: control (`MembershipSection.tsx:355`) shows them **Additional packs**; the `/membership` treatment shows only the **public** ladder. No path auto-maps public→Additional. So without a fix, the member cohort measures *offer*, not *design* — and if the treatment wins and replaces control, members silently lose Additional-pack purchasing on promo pages (a revenue regression).

**Options:**
- **Option A — offer parity (RECOMMENDED).** Treatment shows members the same Additional packs control does, via the opt-in hook flag (§4.4). Clean data for *all* cohorts; treatment is a true drop-in replacement. Reuses the existing member-aware `isLocked`/access logic — modest, non-breaking code. Honors "members in."
- **Option B — faithful `/membership` copy + exclude members.** Simpler treatment, but the infra has **no native member-exclusion** (only admins are auto-excluded), so excluding members needs *custom* assignment/targeting logic — *more* machinery than Option A, and it contradicts your "members in" answer. A winning treatment would still need member handling before full rollout. **Not recommended.**
- **Option C — keep members bucketed, analyze guests only.** This is the band-aid you asked to avoid. **Not recommended.**

**DECIDED: Option A** (confirmed by DJ, 2026-07-01). The spec is written around it.

---

## 6. CTA-click funnel signal (DECIDED: included)

**Included** (confirmed by DJ, 2026-07-01). To see whether a design drives more *intent* even when final conversion is close, the package CTA emits an A/B `click` event:
```ts
const { experimentId, variantId } = useVariantContext();
const { trackEvent } = useExperimentTracking();
if (experimentId && variantId) trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId });
```
This writes an `ExperimentEvent` (System B, diagnostic; **not** the winner metric — the winner is always System A per §2.4). It's ~5 lines and safe (no-ops without a variant context).

**Wire it into BOTH arms for a comparable funnel.** The control (`MembershipSection` via `PromoPackages`) currently emits no A/B event, so add the same emit on its package-CTA path guarded by `useVariantContext()` (no-ops when the section renders outside an experiment, e.g. the 15+ non-promo pages that mount `MembershipSection`). Use a stable `element: "package_cta"` so the 5-second click-dedup in `/api/ab-testing/track` keys per-CTA. Dropping this later has no impact on the primary result.

---

## 7. Reading results & winner-swap runbook

Document in `docs/ab-testing/` (and reference from this spec):

1. **Deciding the winner:** open the experiment in admin → A/B Testing → read the **"Result — user-level · Bayesian"** panel (chance-to-win, lift, revenue). **Ignore the legacy chi-square "Winner Determination" card** — its pageViews-based rate is not comparable. Wait for the 14-day window + adequate sample before trusting it.
2. **Making the winner permanent (code swap):**
   - If **treatment wins:** make `"membership"` the default in `PromoPackages` (render `PromoMembershipDesign` unconditionally), delete the `MembershipSection` promo branch if it has no other promo consumers, and remove the config field + admin selector. Keep `PromoMembershipDesign`.
   - If **control wins:** delete `PromoMembershipDesign`, the `packages.design` field, the validation branch, the admin selector, the `includeAdditionalForMembers` flag, and the seed script.
   - Either way: end/archive the experiment in admin first, then remove the loser's code in one commit.
3. **Cleanup checklist** (config field, validation branch, admin selector, hook flag, seed script, this spec) so no dead A/B scaffolding lingers.

---

## 8. Edge cases & footguns

- **Experiment overlap** — enforced by the seed's overlap guard (§4.5). Do not run this alongside another active experiment targeting the same prize slugs.
- **14-day window** — impulse promo buys are typically same-session, so this rarely bites, but a purchase >14 days after first exposure won't count in System A. Acceptable.
- **Subscriber CTA routing** — `useMembershipCardCta.onSelect` routes existing/past-due subscribers to `/my-account` rather than opening the modal; confirm the plan matches control's behavior for that sub-segment so it isn't a second confound. (Guests/new users — the dominant cohort — are unaffected.)
- **Two config channels** — `variantConfig.packages` (prop path we branch on) is distinct from the membership-modal config `MembershipSection` reads from context. Don't conflate them.
- **Admins excluded** from all assignment — test buckets with a non-admin account.
- **Seed to active** is intentional and authorized; the overlap guard + idempotency + `--dry-run` default keep it safe.

---

## 9. Out of scope

- No changes to `MembershipSection` (control) beyond reading the new `design` value in `PromoPackages`.
- No new metric infrastructure — primary conversion is automatic via System A.
- No redesign of either package UI.
- No feature flag (commits are the rollback unit; the experiment itself is the toggle).

---

## 10. Implementation phases (for writing-plans)

1. **Config + branch + treatment (complete, correct treatment).** Add `packages.design` (interface + validation + admin selector); branch `PromoPackages`; build `PromoMembershipDesign` with the duplicate-anchor fix; add the `includeAdditionalForMembers` hook flag and wire member parity (Option A). Verify: control render is unchanged; treatment renders the /membership design on a promo page; members see Additional packs in both arms. `tsc` + lint clean.
2. **Seed script + activation.** `scripts/seed-promo-packages-design-experiment.ts` (straight-to-active, `slugTargets` from `listPrizes()`, idempotent, overlap guard, dry-run default) + npm entries. Verify with `--dry-run` against a scratch/staging DB; confirm both mount families bucket (a `[slug]` prize page and a brand page resolving on `{brand}-milwaukee`).
3. **Diagnostics + docs.** CTA-click event on both arms (§6); `docs/ab-testing/` update including the reading-results + winner-swap runbook (§7); doc-sync for touched domains (`ab-testing`, `promo`, `subscription`, `shared-ui`).

---

## 11. Docs to update (doc-sync)

- `docs/ab-testing/` — new experiment entry + runbook (§7).
- `docs/promo/` — `PromoPackages` now branches on `packages.design`.
- `docs/subscription/` — `useMembershipCardCta` gains `includeAdditionalForMembers`.
- `docs/shared-ui/` — `MembershipTierChooser` gains a `sectionId` prop.
- No BUSINESS.md/README.md change expected (no tier/price/access-rule change) — an A/B test of *presentation* only. Confirm during implementation.
