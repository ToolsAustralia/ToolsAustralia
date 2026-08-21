# Shared UI — Frontend

## Promotions account menu — radial scrim removed (2026-08-11)

`PromotionsAccountButton` (the bottom-left FAB column on `/promotions/*`) used to fade in a
**320 × 320 radial scrim** behind the open menu — `radial-gradient(circle at 34% 76%,
rgba(0,0,0,0.55) → transparent 70%)`, animated on `isOpen`. It has been **removed** (owner call).

Its stated job was keeping the dark-glass discs readable over bright prize art, but in practice
it rendered as a large grey smudge across the hero whenever the menu opened — more distracting
than the contrast problem it solved. The discs keep their own `backdrop-blur-sm` and border,
which is what actually carries their legibility.

**If contrast becomes a genuine problem on a specific hero, tint that disc** rather than
reintroducing a full-bleed circle over the artwork.

## `DiscountOfferList` reports the access seam to page analytics (2026-08-11)

The `WallMarker` — the dashed gold seam where a viewer's access stops — now optionally reports
itself via `onSeamRendered` / `onSeamReached`. Three things to preserve if this component is
touched:

- **An `IntersectionObserver` on the marker, never a scroll listener.** It fires once and
  disconnects. The list runs to 1,833 rows and this component's sibling page-client documents at
  length what happens when work is coupled to scroll position here.
- **A wall on the FIRST band is not a seam, and neither callback fires for it.** `reachable` is
  `signedIn && viewerPct >= level`, so for a signed-out visitor *every* band is unreachable and
  the marker lands above the very first row. Reporting that would make "reached the seam" true
  for anyone who saw the top of the list — a column reading ~100% while measuring nothing.
- **Callbacks are read through a ref** inside `WallMarker`, so a parent passing an inline arrow
  cannot re-subscribe the observer on every render.

Both props are optional; the component renders identically without them. See
[partner/analytics.md](../partner/analytics.md).

## MembershipModal sends the visitor's built prize at signup (2026-07-28)

`handleRegistration` derives `builtPrizeSlug` directly after the existing `promotionSlug`
extraction (pathname `/promotions/<slug>`) and sends it in the register POST body
(`...(builtPrizeSlug ? { builtPrizeSlug } : {})`). It calls the exported pure function
**`resolveBuiltPrizeSlug(params, fallbackSlug)`** over `new URLSearchParams(window.location.search)`
with `promotionSlug` as the fallback. **Why the shared helper matters:** two independent
derivations of "what prize is on screen" would drift, and the signup row would stop agreeing with
the visit row it's meant to corroborate — the whole point of carrying the build to signup is so a
registration can be attributed to the prize the visitor actually assembled, not just the landing
page.

**Not literally the same call site as the visit-side beacon** — worth knowing if you touch either:
[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) (the prize card's host)
does not call `resolveBuiltPrizeSlug` itself. It hydrates `?toolset=`/`?toolbox=` into React state
via `parseToolboxQueryParam`/`parseToolsetQueryParam` directly, then derives the beacon's
`builtPrizeSlug` through `toPrizeSlug` + catalog resolution (`usePrizeCatalog`'s `activeSlug`) —
a second, catalog-aware path, because the reel's live selection lives in component state, not in
a one-shot URL read. The modal has no such state, so it calls `resolveBuiltPrizeSlug` — the
pure, catalog-free equivalent — directly. The two paths are proven to agree for every real
combination by the `prize-builder-model.test.ts` "every resolvable build is a real catalog prize"
assertion (every `TOOLBOXES × TOOLSETS` pair resolves to a slug present in `PRIZE_SUMMARIES`), so
today they can't drift — but if that registry-completeness invariant is ever relaxed, re-verify
this parity.

Imported from **`@/components/sections/promo/prize-selection/utils`** directly, not the
`prize-selection` barrel (`index.ts`) — the barrel also re-exports `PrizeBuilderCard` /
`SelectorReel` / `ComboHero` (heavy client UI with their own animation/asset deps), while
`utils.ts` imports only `constants.ts` + `prize-builder-model.ts` + (as of the fix below)
`@/config/promo-landing-slugs`, itself a lightweight data/config module (no React, no reel UI —
verified transitively: it pulls in only `brand-theme.ts`, `promo-hero-types.ts`, the generated
`landingImageManifest.ts`, and a type-only import from `config/prizes.ts` that TypeScript erases
at compile time). Importing the barrel into a modal that's already a large client bundle risked
pulling the reel components along for the ride; the direct module path keeps the modal's import
graph to just the slug/query math plus this small config lookup.

Derivation is wrapped in its own try/catch (mirroring the `promotionSlug` extraction immediately
above it) so a throw here can never block registration — attribution is best-effort.

**Untouched-landing-page fallback fix (2026-07-28, fix round 1):** on an untouched
`/promotions/<slug>` page (no `?toolset=`/`?toolbox=`), `resolveBuiltPrizeSlug` resolves the
fallback slug to that page's **default prize**, not the bare landing slug. The first cut of this
task returned the `promotionSlug` fallback unchanged (`"makita"` on `/promotions/makita`) — but
`"makita"` is a LANDING slug, not a prize (no toolbox lane), and `promotionSlug` already records
it, so passing it through again as `builtPrizeSlug` made the field polymorphic (sometimes a real
prize, sometimes a landing page) and defeated the field's purpose. Fixed **in the shared helper**
(not the modal, so every caller stays in lockstep): `resolveBuiltPrizeSlug` now resolves a bare
toolset-landing `fallbackSlug` via `isToolsetLandingSlug` + `getDefaultPrizeForToolsetSlug` (both
from `@/config/promo-landing-slugs`) to the page's real default prize (`"makita-milwaukee"`)
*before* using it — both for the "no params" short-circuit and for filling a missing lane when
only one of `?toolset=`/`?toolbox=` is present (e.g. `?toolset=ryobi` on `/promotions/makita` now
correctly resolves to `"ryobi-milwaukee"`, taking the toolbox lane from Makita's resolved default
rather than being left unresolved). A fallback that is already a real prize slug (not a landing
slug) passes through unaffected. See the "Built prize slug resolution" test group in
`prize-builder-model.test.ts` for the full input/output table this now guarantees. See
[auth/api.md](../auth/api.md#post-apiauthregister--builtprizeslug-attribution-2026-07-28) for the
server side and [subscription/models.md](../subscription/models.md#signupattributionbuiltprizeslug-2026-07-28)
for the persisted field.

## Header / Footer — "Major Draw" vs the `/promotions` showroom (2026-07-22)

`Header.tsx` declares **`MAJOR_DRAW_HREF`** (`/promotions/${DEFAULT_PRIZE_SLUG}`) once at module
scope: the "Giveaways → Major Draw" item is rendered TWICE (desktop dropdown + mobile menu) and two
literals would drift. The **footer's "Promotions" Quick Link is the only in-app link to the
`/promotions` showroom** — it was repointed off the default slug for exactly that reason. Full
routing table + rationale in [promo/frontend.md](../promo/frontend.md) "Entry points".

## `.ta-product-stage` — the lit plate a prize render sits on (2026-07-22)

The plate behind a combo render is **one shared class** in globals.css, used by the prize builder's
[`ComboHero`](../../src/components/sections/promo/prize-selection/ComboHero.tsx), the /promotions
showroom's case and its rail thumbs — so the same prize can never appear on two different surfaces.

Light keeps the near-white studio plate. **Dark uses the same panel gradient the reel cards use, plus
an accent bloom** (`--ta-stage-bloom`, set inline from the current selection) so the gear is lit by
its own brand colour instead of floating on a white slab in an otherwise black page (owner).

This is safe because the art allows it, and that was **verified, not assumed**: the combo renders
(`majordraws/{set}-set/{set}-{box}.webp`) and the toolbox renders are **45–60% transparent with fully
transparent corners**. The one opaque render is the cash art, which brings its own dark green
background and sits on either plate unchanged. **The counter-example matters:** the prize gallery
photos that feed `PrizeContentsStrip` are **0% transparent with baked light backgrounds** (corners
≈ `#f5efea`), so those tiles must KEEP a light plate — putting them on `.ta-product-stage` would just
frame a light photo in a dark box. Check an asset's alpha before moving it onto a dark surface.

## `--pgs-*` — the /promotions showroom token layer (2026-07-22)

`.prize-gallery` / `.dark .prize-gallery` in globals.css, the same contract as the `--pbc-*` prize
builder block above it: surface palette keyed off the `.dark` html class rather than read from the
Zustand theme store, so a page that IS the fold paints the right palette on the FIRST server-rendered
frame. It is a SEPARATE layer from `--pbc-*` because the showroom has its own page ground, stage
gradient and card colour — borrowing the builder's tokens would make a configurator tweak silently
restyle the gallery. `--pgs-accent` is deliberately not declared there: it is set inline on the stage
root from the selection. `--pgs-glow-alpha` carries the handoff's `<accent>22` / `<accent>34` hex
alphas as an opacity so ONE gradient declaration serves both themes with any brand colour.

## `BrandMark` + `accentInk` / `contrastRatio` (2026-07-22)

- **[`BrandMark`](../../src/components/sections/promo/prize-selection/BrandMark.tsx)** was extracted
  out of `ReelCards.tsx` when the showroom needed the same three toolbox wordmarks. One
  implementation, one `.pbc-brand-mark` rule: the toolbox marks are WHITE-on-transparent silhouettes,
  and masking is what lets one asset serve both themes at the brand's own colour. It sizes itself as
  a **percentage of its plate**, so the registry's `markScale` levels the marks to a common LETTER
  height — give it a fixed-height plate, don't override its width/height.
- **`accentInk(hex, darkInk?)`** in [`prize-brand-colors.ts`](../../src/utils/prize-brand-colors.ts)
  picks legible ink for text on a filled brand accent using **real WCAG 2.1 relative luminance**
  (gamma-corrected), returning whichever of white / near-black actually has the better contrast.
  `contrastRatio(a, b)` is exported alongside it. **Do not copy the naive
  `(0.2126R + 0.7152G + 0.0722B)/255` form** still present in `WinnerCard`, `WinnerFilterToggle` and
  `cobberAccent`: skipping sRGB gamma puts saturated mid-tones on the wrong side of the line and
  returns white ink at 2.4–3.1:1 (Makita teal, HiKOKI green, cash green) — a WCAG AA failure. Those
  three call sites still hold their own copies; fold them in when one is next touched.

## `data-floating-widget` — the bottom-floater coordination contract (2026-07-07)

Any element that **fixes itself to the bottom of the viewport** (banners, sticky CTA bars, corner FABs) MUST carry **`data-floating-widget="true"`** on its outermost fixed node. This is the opt-in contract the Cobber support-chat launcher reads to avoid overlapping them: [`useDodgeFloatingObstacles`](../../src/components/support-chat/useDodgeFloatingObstacles.ts) scans `[data-floating-widget]` and lifts the bubble above any that collide with its corner (AABB test — see [ai-chatbot/gotchas.md § Launcher placement](../ai-chatbot/gotchas.md)). Current carriers: [`FloatingCountdownBanner`](../../src/components/banners/FloatingCountdownBanner.tsx), [`FloatingGetEntriesButton`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx), [`FloatingGiftIcon`](../../src/components/ui/FloatingGiftIcon.tsx), [`SpotlightPreview`](../../src/app/promotions/_components/SpotlightPreview.tsx)'s mobile CTA. **When you add a new bottom-anchored floater, add the attribute** and the launcher dodges it automatically — no other wiring. (The attribute is cheap and inert for anything that doesn't consume it.)

**Dev overlays share this corner (2026-08-10).** `PromoHolidayDevToolbar` (`bottom-3 left-3`, `z-[10000]`) and `MajorDrawTestControls` (`bottom-6 left-6`, `z-[9998]`) both park in the bottom-left in development, on top of any product UI there. Both now have a ✕ that clears the corner for the current page view (in-memory; a reload restores them) — see [dev-tooling/frontend.md](../dev-tooling/frontend.md). Keep that in mind when placing new bottom-left chrome: it will look occluded in dev and fine in production.

**Put the attribute on the VISIBLE element, not a full-width centering wrapper (2026-08-10).** The three centered bars (`FloatingGetEntriesButton`, `FloatingCountdownBanner`, `SpotlightPreview`'s CTA) are all built as a `fixed inset-x-0 flex justify-center pointer-events-none` wrapper around a narrow pill. The attribute used to sit on the **wrapper**, whose rect spans the whole viewport — so the AABB test reported a collision with both bottom corners on every viewport, and the corner controls lifted ~70px for a pill that visually came nowhere near them (measured: pill spans x 127→253 on a 390px screen; the right corner starts at x 322). Moving the attribute onto the pill is what makes the two documented behaviours above actually true: on mobile the countdown banner is `w-full mx-4`, still reaches the corner, still lifts; on desktop it's `max-w-4xl` centered and correctly does **not**. It also removed a visible lag — the lift was animating in late behind framer's entrance, so the FABs appeared to jump a beat after the bar arrived.

**Carry the attribute only while the floater is actually VISIBLE (2026-08-10).** If your floater **unmounts** when hidden (framer `AnimatePresence`), a static `data-floating-widget="true"` is correct — it disappears with the element. But if it **stays mounted and parks itself invisible** (`opacity-0`, an offscreen translate), its rect is still non-zero, the hook's `width/height === 0` check can't see through it, and the corner controls stay lifted over a bar the user can't see. Bind the attribute to the same state that drives visibility — `data-floating-widget={shown ? "true" : undefined}` — which is what `SpotlightPreview` does. The dodge hook's `MutationObserver` already watches this exact attribute, so toggling it recomputes with no extra wiring.

Do **not** try to solve that by reading computed opacity inside the hook: framer obstacles animate in *from* `opacity: 0` via rAF-written inline styles and emit no `transitionend`, so an opacity gate silently **misses a real obstacle** whenever the scroll stops right at the mount boundary. Attempted and reverted 2026-08-10 — visibility is the floater's own state to declare, not something the hook should infer.

> **Known gap (pre-existing, unfixed):** a framer obstacle that finishes its entrance animation *after* the scroll has stopped isn't dodged until the next scroll event — the `MutationObserver` fires on mount, when the element is still translated out of the corner, and framer's per-frame inline styles produce neither a DOM-structure mutation nor a `transitionend`. Closing it needs an attribute-level observer bound to the obstacle elements.

## FAQ answers render markdown (2026-06-25)

`FAQSection` (`src/components/ui/FAQSection.tsx`) renders each FAQ `answer` through `<ChatMarkdown>` (`src/components/support-chat/ChatMarkdown.tsx`) so markdown links in `src/data/faqs.ts` answers become clickable — internal links (`/...`) navigate in-app, external (`http...`) open in a new tab. Plain-text answers render unchanged. The same renderer powers the Cobber support chat widget, so the FAQ page and the bot stay visually consistent.
> **PromoBanner `followOnScroll` prop (2026-07-07):** `PromoBanner` (`sections/promo/PromoBanner.tsx`) gained
> an optional **`followOnScroll?: boolean`** (default `true` = the landing-page behaviour where it goes
> `fixed z-50` and floats as a pill on scroll). When `false`, `applyScrollThreshold` early-returns so
> `isScrolled` never flips true — the banner stays `relative`/in-flow and just scrolls away. Passed `false` on
> the `/promotions` gallery, which has its own sticky filter dock (two floating top elements would collide).

> **Header nav: "Giveaways" dropdown replaces "Mini Draws" (2026-07-07):** the top-nav "Mini Draws" tab
> (`Header.tsx`, desktop + mobile) is now a **"Giveaways" dropdown** mirroring the existing "Results" dropdown
> pattern: **Major Draw → `/promotions`** (the combinations gallery) and **Mini Draw → `/mini-draws`** (existing
> route — the request said "/mini-draw" but the real route is plural). State: `isGiveawaysMenuOpen` /
> `isMobileGiveawaysOpen`; active-state helper `isGiveawaysActive()` = on `/promotions` OR `/mini-draws`;
> click-outside closes via the `.giveaways-dropdown-container` selector. Trigger icon `Gift`, items `Trophy`
> (major) / `Ticket` (mini).

> **Mini-draw copy: no "only drawn when full" framing (2026-07-07, owner call):** the Draws mini-tab explainer
> (`DrawsMini`) and the entry sheet footnote (`MiniDrawEntrySheet`) no longer lead with "no clock — they run
> when they fill" / "picked the moment it fills" — for a draw far from its target that reads as "might sit
> forever" and discourages entry. Reframed short + motivating with the SAME mechanics (owner also asked for
> brevity): "**Small pools, real chances** — someone always takes the prize. Mini entries don't roll into the
> major draw." / entry sheet: "winner drawn automatically — someone always takes the prize." Trigger model
> unchanged.

> **Tier list: "See full membership details" link (2026-07-07):** `MembershipTierList` renders a small
> centered sky text-link under the tier cards → the PUBLIC **`/membership`** page (the in-depth benefit
> breakdown), so undecided users can read the full pitch before committing from the dashboard tier list.

> **MembershipModal selection-first: synchronous + dismissal-only onClose contract (2026-07-06):** the
> guest-conversion "Become a member" flow. Three coordinated changes (adversarially verified — the first
> iteration had a same-tick stale-state blocker, see below):
> 1. **`PackageSelectionModal` no longer self-closes after a pick** — `onPlanSelect` hands the pick to the
>    parent, which closes the picker (`handlePackageSelect`); **`onClose` now means DISMISSAL ONLY**
>    (✕/backdrop). The old select-then-`onClose()` pair fired before React committed the new plan, so any
>    dismiss-handler reading the selected plan saw the stale placeholder — the first fix iteration closed the
>    WHOLE modal right after a pick because of this. Consumers: MembershipModal + the dev modals gallery
>    (whose `onPlanSelect` now closes).
> 2. **Config-driven selection-first opens the picker synchronously** (any provided config whose flag isn't
>    `false`, incl. legacy `{}`), gated on `isPlaceholderPlan` — a REAL selected plan (specific card clicked)
>    is never overridden by the picker. Previously a **300ms-delayed overlay** left the placeholder payment
>    view (grey skeletons) as the guaranteed first paint, and inline `membershipModalConfig` objects reset the
>    timer on every parent re-render, starving the overlay. The implicit promotions-page auto-open keeps its
>    intentional 300ms delay.
> 3. **Dismissing the picker before choosing closes the whole modal** (`configSelectionFirst &&
>    isPlaceholderPlan`) instead of stranding the user on the skeleton payment step; after a real plan is
>    selected, dismissal behaves normally ("Change" flow unaffected).
> 5. **Reopen-while-closing fix (2026-07-07):** the picked-plan → ✕ → re-tap flow could show the placeholder
>    payment view with the picker never opening. Root cause (traced): `handleClose` AWAITED the
>    PaymentIntent-cancel fetch before `onClose()`, leaving the modal visibly open a whole network
>    round-trip — a selection-first re-tap in that window re-opened WITHOUT ever rendering a closed frame,
>    so `packageSelectionAutoOpenedRef` (reset only on a rendered `isOpen=false` commit) stayed armed. Fixes:
>    `handleClose` now closes the UI first and cancels the intent **fire-and-forget**; and the latch is
>    **per placeholder-episode** (re-armed whenever a real plan is selected), so a fresh selection-first
>    request auto-opens the picker even if no closed frame ever rendered.
> 4. **Hardening from the second adversarial pass:** Escape while the picker is open now dismisses the
>    PICKER (same `dismissPackageSelection` path as ✕/backdrop) instead of closing the whole modal and
>    leaving the picker orphaned over the page (pre-existing hole — MembershipModal stays mounted with
>    `isOpen=false`, so stale `isPackageSelectionOpen` kept rendering it); an orphan-proofing effect also
>    resets the picker on ANY whole-modal close. The picker's 200ms tap→glow→select timeout is cancelled on
>    close/unmount (a pick followed by an instant ✕ used to commit the plan into the closed modal — stale
>    preselect that skipped selection-first on the next open) and a rapid re-pick supersedes the pending one.
> Note: "Buy a package" → Apprentice Pack preselected straight into payment is `openWithOneTimePlan()`
> working as designed (first public one-time pack in the static catalog). Test-infra caveat: the modal smoke
> tests are `renderToString`-only — they cannot catch these interaction paths; all regressions here were
> found by control-flow tracing + adversarial review.

> **Guest panel: view-the-draw redirect (2026-07-06):** `DashboardGuestPanel`'s "Enter the {draw}" card title
> row now carries a small `ArrowUpRight` icon-link to **`/promotions`** (→ the default promotions landing, the
> prize showcase; NOT `/major-draw`, which hard-redirects to `/promotional/giveaway`) — a guest holds no
> entries yet, so they get a way to *see* the draw before committing to either CTA.

> **Redeemable unlock flow + MembershipModal coupon auto-apply (2026-07-06):** `RewardsClaimables` gained an
> `onUnlock` prop — locked purchase-required coupons render an actionable amber "Join to unlock" / "Purchase to
> unlock" CTA (was a disabled dead-end). `MembershipModal` now **auto-applies** codes arriving via the
> `openMembershipModal` prefill event (`pendingAutoApplyCode` one-shot → `handleCouponApply("auto")`) — prefill
> alone lost the coupon carry if the user paid without clicking Apply. Legacy `RedeemablesWallet`'s never-wired
> "Unlock" no-op removed (qualified items redeem directly). Full flow + routing rules:
> [rewards-redeemables/frontend.md](../rewards-redeemables/frontend.md).

> **Scheduled downgrade shown on the plan status row (2026-07-06):** `MembershipCurrentPlan` (and, in lockstep,
> the dashboard `ManageSheet` plan summary) now surface a **pending downgrade**. When a member downgrades, they
> keep the higher tier's benefits until `endDate` (`getEffectiveBenefits` → the card still shows the higher
> tier + stats), then drop to `subscription.packageId` (the new lower tier). The status row now reads
> **"Downgrades to {tier}" / "{date} · ${price}/mo after"** instead of "Renews … / Auto-renews monthly",
> driven by the canonical `hasPendingDowngrade` + `getDowngradeEffectiveDate` (same source as the Header
> "Premium benefits" countdown). Row precedence: **past-due > scheduled cancel (autoRenew off) > scheduled
> downgrade > normal renewal** (a cancel supersedes a downgrade).

> **Tier re-tap after cancelling the payment modal (2026-07-06):** from the account membership "Change your
> tier" list, tapping a tier sets the page's `changeTierName` → mounts `SubscriptionManagementModal` in
> `confirmOnly` mode (`autoSelectPlanName`), which auto-opens the upgrade confirm → Stripe payment modal. The
> parent only resets `changeTierName` via its `onClose`, and the auto-select is latched by a ref that clears
> only on unmount — so any cancel exit that doesn't call the parent `onClose` leaves the modal mounted + the
> ref latched, making a re-tap of the **same** tier a silent no-op (looked like a ~1-min "won't open"; it was
> actually permanent until an unrelated remount). The `UpgradeConfirmModal`/`DowngradeConfirmModal` cancels
> already called `if (confirmOnly) onClose()`; the **`StripePaymentModal` cancel was missing it** — added, so
> cancelling the payment step in confirmOnly closes the whole flow and a re-tap re-opens. No TTL/dedup was
> involved. Verified: `npm run test:subscription-management`.

> **`UpgradeBenefitStatGrid` — one benefit grid for both upgrade steps (2026-07-06):** the two steps of the
> membership upgrade flow rendered DIFFERENT benefit cells — step 1 (`UpgradeConfirmModal/BenefitsBody`) showed
> **Partner offers % · Partner access · Free entries / cycle** (Anton font, icon+tint, real props); step 2
> (`StripePaymentModal/UpgradeBenefitsPreview`) showed **Entries / mo · Partner access · Per month $** (acumin
> font, bordered, **hardcoded** entries + a stale/unused partner %). Extracted
> [components/ui/UpgradeBenefitStatGrid.tsx](../../src/components/ui/UpgradeBenefitStatGrid.tsx)
> (`{ tier, partnerPct, entriesPerCycle }`) — the single 3-cell grid both steps now render, so they're identical
> (same stats, labels, font, icons, tint). Numbers must be canonical: partner-catalog %
> (`getPartnerCatalogAccessPercentForPlanId`) + the package's `entriesPerMonth`. Price is NOT a cell (it lives in
> the order summary / checklist). See [subscription/frontend.md](../subscription/frontend.md).

> **Partner-discount card de-dup — past-due-with-pack subline (2026-07-06):** for a past-due member holding a
> live one-time pack, `RewardsPartnerCard` + `PartnerPreview` showed `"{pct}% active · ends in {X} · membership
> paused"` — but the ring already renders `{pct}%` (and the Rewards headline already says "Active from your
> pack"), so `{pct}%`/"active" were duplicated. Sublines now drop the ring-duplicating `%`: Rewards →
> `"Ends in {X} · membership paused"`, PartnerPreview (generic "Partner discounts" headline) →
> `"Active · ends in {X} · membership paused"`. Same facts, no echo.

> **Past-due hero de-dup — ring says "Paused" (2026-07-06):** the past-due `DashboardHero` stamped the state
> three times in one stack — the access ring label ("Past due"), the tier chip ("TRADIE · PAST DUE"), and the
> amber ribbon ("Renewal failed…"). The ring label + chip were the literal same words. The ring (which shows the
> partner-access % for active/one-time) now labels the past-due shield **"Paused"** (access paused) instead of
> repeating "Past due" — matching the Rewards/Partner card's "Paused" vocabulary. The chip keeps "· past due"
> (tier + status identity); the ribbon stays the CTA.

> **Past-due ribbon copy — benefits, not just entries (2026-07-06):** `DashboardAlertRibbon`'s past-due (amber)
> pill now reads "Renewal failed — update payment to keep your **partner discounts, free entries & bonus offers**"
> (was "…keep earning entries"). Leads with member benefits and still names entries, mirroring the one-time (teal)
> sibling pill's vocabulary ("partner discounts, more free entries & bonus offers") for one consistent benefits phrasing.

> **`FreeEntriesChip` — the "+N free entries" stat chip (2026-07-06):** shared component
> [components/ui/FreeEntriesChip.tsx](../../src/components/ui/FreeEntriesChip.tsx) (`{ value, tone: "gold" | "amber" }`),
> the single source for the three surfaces that show it: `EntryWallet`'s renewal note (gold) + past-due note
> (amber), and the resolve popup/sheet `RenewalPreviewNote` (amber). It **mirrors the red countdown `CDBox`
> recipe** — `rounded-xl` · `bg-gradient-to-br` · `shadow-[0_8px_18px_-8px_…]` · inset ring · a Poppins-black
> `+N` — so "entries you gain" reads as the gold/amber sibling of the "time you're losing" countdown. **"FREE"
> is a white corner badge** (not a second label row) so the chip stays one-number-tall + compact; the single
> label under the number is "ENTRIES". Replaced the earlier flat tinted-box + Sparkles-tile note. In
> `EntryWallet` it hangs on a `border-t border-token` seam (no card-in-card); the figure is the corrected
> accumulated renewal grant (see [dashboard-account/frontend.md](../dashboard-account/frontend.md)). Presentational-only.

> **Header sign-out (2026-07-02):** the site `Header` menu sign-out now calls `totalSignOut()`
> ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)) instead of a bare
> `signOut()` + 2-key localStorage wipe. See [auth/frontend.md](../auth/frontend.md#total-sign-out-2026-07-02).

> **Payment sheet panel (2026-07-02):** `SettingsRedesignPayment` (rendered by the Payment overlay
> sheet via `PaymentMethodsTab settingsRedesign`) was rewritten from a card-face grid to the clean
> prototype layout — hero card face (default card, content-height not stretched) → "Saved cards"
> radio rows (Default badge / Remove) → dashed "Add a new card" → encrypted footer. Cardholder name
> is threaded in from the orchestrator (`index.tsx`). The **add-card form** (`AddPaymentForm` + the
> `addFormNode` chrome in `index.tsx`) was also restyled to the design — "Add a new card" header,
> `PaymentElement` (card details) + a **Name-on-card** input, Cancel / **Add card** buttons. Still
> presentational-only; the shared `buildMembershipStripeAppearance` (7 modals) is untouched; all
> Stripe wiring (SetupIntent / confirmSetup) unchanged.

> **Styled dropdown + promo shimmer (2026-07-02):** new `components/ui/SelectMenu.tsx` — a
> design-system dropdown (button + popover on `border-token` / `bg-surface`, outside-click/Escape
> close) that replaces the native `<select>` in the settings personal-details (native OS menus don't
> match our tokens). Separately, the dashboard promo banner shimmer now uses a dedicated
> `promo-shimmer-sweep` keyframe (globals.css) that travels the FULL banner width — the old `shimmer`
> keyframe was a diagonal *badge* effect whose transform overrode the band's skew, so it never swept.
> The sweep uses an **ease-out** cubic-bezier (`.promo-banner-shimmer`) so the highlight enters fast
> then decelerates, like a real shine (not a linear crawl).

> **Current-plan action rows (2026-07-02):** `MembershipCurrentPlan`'s manage actions are two rich
> rows — "Renews {date} / Auto-renews monthly → **Manage**" and "Payment method / {Visa •••• 4827} →
> **Edit**" (the default-card label is passed in as `paymentLabel` from the membership page's
> `useSavedPaymentMethods`) — replacing the flat icon+label rows; the redundant in-gradient "Renews …
> cancel anytime" line was dropped.

> **Tier-change auto-select (2026-07-02):** `SubscriptionManagementModal` gained an **opt-in**
> `autoSelectPlanName` prop — once benefits load it opens the upgrade/downgrade confirm for that tier
> (matched by name), reusing the existing `setSelectedUpgrade`+`setShowUpgradeConfirm` setters, so
> other callers stay byte-identical. `MembershipTierList` gained `onChangeTier(planName)` (member taps
> a different tier). Full flow in [dashboard-account/frontend.md](../dashboard-account/frontend.md).

> **Claimable rewards trigger (2026-07-02):** `RewardsClaimables` replaced its inline "Ready to claim"
> list with an **animating gift trigger** — the icon bounces + shows a count badge ONLY when there are
> truly-claimable rewards (`isRedeemableNow`, not locked/paused) — that opens a claimables `SheetShell`
> overlay holding the Claim buttons. "Recently claimed" stays inline.

> **DrawsMajorHero — dropped status row + overlap (2026-07-02):** removed the "Live · {draw} · Drawn
> 8:30 PM AEST" status row (redundant with the Draws toggle bar); the prize showcase (tagline / title /
> Setup-vs-$10k picker / checklist / "View this promotion") stays, and its `drawName`/`drawStatus`
> props are gone. The draws page dropped the entries card's `-mt-[34px]` overlap (now `pt-4`) — that
> negative margin had been covering the "View this promotion" button with "Your entries".

> **Entries label + mini-draw ranking + copy (2026-07-02):** `EntryWallet`'s "One-time packs" label →
> **"One-time"** (verified: the one-time bucket sums EVERY non-membership source — one-time packs,
> upsell, referral, rewards/redeemables, promo-link, mini-draw — see `major-draw-queries.ts:139`), and
> the two entry labels are flushed left/right (`justify-between`). `DrawsMini` now ranks by **fill %**
> (top 8 closest to running) — fetches a wider active set and sorts by `totalEntries/minimumEntries`,
> not newest — and its blurb was rewritten (was generic). `RewardsMilestones` dropped the "Rewards
> land in your **wallet**" wording (not the business's language — there's no "entry wallet").

> **"Get more entries" button + premium countdown (2026-07-02):** `EntryWallet`'s inline package CTA
> carries the promo energy itself (no separate banner): "+ Package" → **"Get more entries"** with a
> `50% OFF` badge (top-left, when `hasAdditionalAccess`) and a `{multiplier}× entries` badge
> (top-right, when `multiplier > 1`) — new props `multiplier` / `hasAdditionalAccess`. The countdown
> `CDBox` cells were restyled from bordered white boxes to the **red-gradient premium cells** the
> promotions page uses ([`HorizontalCountdown`](../../src/components/sections/HorizontalCountdown.tsx)):
> `bg-gradient-to-br from-red-500 via-red-600 to-red-700`, white `font-black` numbers, `red-100`
> labels, `ring-1 ring-red-300/30` (accent prop dropped — every cell is gold-topped/red now).

> **Mini-draw entry sheet + shared purchase hook (2026-07-02):** the Draws-tab mini cards now open
> [`MiniDrawEntrySheet`](../../src/components/sections/draws/MiniDrawEntrySheet.tsx) in place instead of
> navigating. The mini-draw entry-pack **money path was extracted out of `MiniDrawPackages` into the
> shared `useMiniDrawPurchase` hook** so the detail page and the sheet share ONE orchestration (same
> `/api/mini-draw/purchase` endpoint, webhook-confirmed grant, upsell) — `MiniDrawPackages` is now
> presentation-only and consumes the hook (byte-identical behaviour). `MiniDrawCard` gained an optional
> `onSelect` (module-level `CardShell` swaps `<Link>`→`<button>`). Full detail in
> [draws/frontend.md § Mini-draw entry sheet](../draws/frontend.md#mini-draw-entry-sheet-dashboard-draws-tab-2026-07-02).

### DashboardLoader (ported from Claude Design, 2026-07-03)

[`DashboardLoader`](../../src/components/loading/DashboardLoader.tsx) is the single brand loader that
**replaced the old thin red-arc spinners** (`animate-spin rounded-full border-b-2 border-red-600` /
`border-4 … border-t-transparent` + "Loading …" text) across the member, admin, and affiliate
dashboards. It is a **1:1 port of the Claude Design "Dashboard Loader.html"** — a premium medallion on
which a brushed-metal **socket ratchet drives a hex bolt** (step + overshoot + settle, with the rig
seating down on the "bite"), plus a red impact flash, friction sparks off the rim, a sheen sweep on
the socket ring, rotating telemetry ticks, a warm pulsing core, a pulsing halo, and a contact shadow;
under it sit "TOOLS AUSTRALIA" + a **ticked progress tape** and a **cycling status**.

- **Fidelity:** the SVG lives inline in the component; the animations + theme rules are the source's
  CSS ported verbatim into [globals.css](../../src/app/globals.css) (all `@keyframes ta*` +
  `.ta-lo-*` / `.ta-loader-*` classes), namespaced and scoped. The source's `html[data-theme="dark"]`
  selectors became **`.dark`** (the app's class, set on `<html>` by both the member `ThemeContext` and
  `AdminThemeContext`), so the medallion is **theme-adaptive** (light/dark disc, rim, gloss, warm).
  Loader CSS vars are namespaced `--lo-*` and scoped to `.ta-loader-root` so nothing leaks globally.
- **Fullscreen:** the wrapper is `fixed inset-0 z-[100]` with its own themed background — no call-site
  `bg-*` override needed (removed). `fixed` is safe: no dashboard-layout ancestor establishes a
  containing block (they use only `overflow`, which does not).
- **Status:** prop `label?` shows a static line; when omitted, it **cycles** the source's brand
  messages ("Loading your dashboard" → "Counting your entries" → "Lining up the next draw" →
  "Tightening the last bolt" — the source's hard-coded "June draw" was generalised). Cycling is a
  client `useEffect` interval, skipped under `prefers-reduced-motion`.
- **Reduced motion:** a media query scoped to `.ta-loader-root *` disables the animations (the source
  killed animations globally — intentionally narrowed here) and freezes the tape at 72%.
- **Fonts:** the mark/status use `var(--font-inter)` / `var(--font-poppins)` (the `next/font`
  families the app exposes on `<html>`) — **not** bare `Inter`/`Poppins`, which resolve to nothing
  loaded and would silently drop to system fonts.
- **Light-lock:** `light` prop → `.ta-loader-light`, which forces the full light palette (bg, text,
  medallion disc/rim/gloss/warm) regardless of `.dark`. Used on the **affiliate dashboard**, whose page
  is light-only (`bg-gray-50`) — without it a dark-theme visitor would see the loader flash dark then
  the page resolve light. Member (`bg-page`) + admin are theme-aware so they stay adaptive.
- **Applied on:** member `my-account/{,draws}` (cycling) + `{membership,settings,benefits}` (static
  labels), `admin/{,layout,[tab]}`, and `affiliate/{,login}` (dashboard `light`-locked).

### SheetShell portals to `<body>` (2026-07-03)

[`SheetShell`](../../src/components/ui/SheetShell.tsx) now renders its overlay through
`createPortal(overlay, document.body)` (SSR-guarded) at `z-[120]` (was an in-place `z-[60]`). Sheets
opened from **deep in a route** — e.g. the Draws-tab [`MiniDrawEntrySheet`](../../src/components/sections/draws/MiniDrawEntrySheet.tsx),
mounted inside `<main>` — otherwise rendered under the fixed `z-40` `BottomNav` and left the top of the
viewport uncovered (the backdrop was trapped in the page's stacking context). Portaling to `<body>`
guarantees a true full-viewport backdrop above the nav + floating chrome, while staying below the
payment/modal layer (`Z_INDEX` 10000). The layout-mounted Support/Payment/Manage sheets are unaffected
(they were already at the layout root).

**Sheet entrance animation (2026-07-03):** `SheetShell` animates in — the panel slides up
(`ta-sheet-up`, `translateY(100%)→0`) on mobile and softly pops (`ta-sheet-pop`, fade + `translateY`/
scale) on desktop, with the backdrop fading (`ta-sheet-fade`); all `motion-safe`-gated (keyframes in
[globals.css](../../src/app/globals.css)). Entrance only — close still unmounts immediately.

> **Rewards route rename (2026-07-03):** the dashboard Rewards tab moved `/my-account/benefits` →
> `/my-account/rewards`; the `Header` (×2) + dashboard-section links (`DashboardGuestPanel`,
> `PartnerPreview`, `QuickActionsGrid`) here were repointed. See
> [dashboard-account/frontend.md § Route rename](../dashboard-account/frontend.md#route-rename-benefits--rewards-2026-07-03).

> **MembershipCurrentPlan one-time fix (2026-07-03):** for `onetime` accounts the current-plan card
> drops the "Renews {date} · Auto-renews monthly" **Manage-subscription** row — a one-time pack has no
> subscription, so that renewal wording + Manage action was a genuine UI bug that made buyers think
> they'd be auto-billed monthly. The slot now advertises membership instead: a **non-clickable** "Become a
> member · Unlock exclusive rewards & free entries" `InfoRow` (no CTA — the "Choose a membership" section
> right below is the join path; the sub wraps so "free entries" isn't truncated). The status pill is
> `whitespace-nowrap shrink-0` so "One-time" no longer wraps to two lines.

> **Mobile dashboard hides the viewport scrollbar (2026-07-03):** the member dashboard scrolls at the
> document level with a fixed `z-40` `BottomNav`. The brand scrollbar is styled on `<html>`, so the
> bright-red thumb spans the full window height and visually runs *behind* the fixed nav — harmless but
> conspicuous. Native apps show no scrollbar, so [globals.css](../../src/app/globals.css) hides the
> document scrollbar under `max-width: 1023px` via `html:has(body[data-account-layout])` (`scrollbar-width:
> none` + `::-webkit-scrollbar { display: none }`). Content still clears the nav through `<main>`'s
> `pb-16`; desktop keeps its scrollbar (no bottom nav to overlap). This is a *cosmetic* hide — not the
> heavier app-shell rework (making `<main>` its own `overflow-y-auto` scroll container), which the layout
> comment warns breaks `DeskNav`'s `sticky top-0` and reintroduces iOS `100dvh` inner-scroll footguns.

> **RewardsPartnerCard brand grid accuracy (2026-07-03):** with the SSO portal off, this grid IS the
> live catalogue, so it now shows the **tier-accurate slice** of `PARTNER_BRAND_OFFERS` (first `N =
> ceil(partnerAccessPct% × total)` — matching `getPartnerCatalogVisibleSliceLength`; 40% → 3 of 7) with
> each brand's **real logo** (`b.logo` via `next/image`, was a letter monogram) and **real offer**
> (`discount` + `category`). Each tile is now a **link to `b.businessLink`** (new tab) when a real URL is
> set (brands with a `"#"` placeholder stay non-clickable). Locked (guest/past-due) still shows a 4-brand
> dimmed teaser.

> **Past-due keeps live one-time pack access (2026-07-03):** a past-due member who still holds a live
> one-time pack has REAL partner access (the pack window is independent of subscription status — honored by
> the queue, SSO, and the shop), so the card no longer force-locks every past-due user. `pastDueWithPack =
> pastdue && partnerAccessPct > 0` → `locked` is now `guest || (pastdue && !pastDueWithPack)`. For
> `pastDueWithPack` the ring shows the real % (not a `Lock`), the headline reads **"Active from your pack"**
> with sub `{pct}% active · ends in {expiry} · membership paused`, the tier-accurate brand slice shows, and
> the CTA stays **"Update payment to restore membership"** (the pack is live; updating payment restores the
> higher membership tier). This fixes the contradiction where the card read "Paused / 0%" while
> `RewardsPartnerQueue` right below it showed the same pack "· 25% active". The 0/expiry values are fed by
> [`useDashboardState`](../../src/hooks/useDashboardState.ts) — see
> [dashboard-account/frontend.md](../dashboard-account/frontend.md#partner-access-for-past-due).

> **Past-due tier list — mark current + switch tier (2026-07-03):** [`MembershipTierList`](../../src/components/sections/account-membership/MembershipTierList.tsx) now takes `isPastDue` + `currentTierKey` + `onResolvePayment` + `onSwitchTier`. For a past-due member it (a) heads the section "**Your membership**" (not "Choose a membership"), (b) marks the current tier with a **"Current · Past due"** amber pill + amber border (a past-due member's plans all read "Update payment", so the current tier is matched by `tierKeyFromName(plan.name) === currentTierKey` instead of the active-member "Current Plan" CTA label), (c) routes a tap on the **current** tier → `onResolvePayment` (payment sheet) and a tap on a **different** tier → `onSwitchTier(plan)`. The switch opens [`PastDueTierSwitchModal`](../../src/components/sections/account-membership/PastDueTierSwitchModal.tsx) — a self-contained amber confirm that POSTs the cancel+void teardown (`/api/stripe/switch-tier-past-due`) then calls `onSwitched` so the page opens the ordinary subscribe flow for the new tier. See [subscription/gotchas.md § Past-due tier switch](../subscription/gotchas.md#money-path) + BUSINESS.md §10i.

> **One-time section header is ALWAYS "One-time packages" (2026-07-03):** the tier list's one-time section header stays "One-time packages" / "No subscription" for **all** states — even when the dashboard feeds it the member's discounted `additional-*` packs. "Additional" is a **backend-only** term; user-facing copy always says "one-time packs" (see [subscription/package-terminology.md](../subscription/package-terminology.md)). The member's discount is conveyed per-card by the `getAdditionalPackDiscount` "% off" coupon badge, not by the header. The pack list (`OneTimePacksGrid` → `PackCard`) renders whatever `cta.oneTimePlans` carries; which set that is (public vs discounted) is driven by the page's `useMembershipCardCta({ includeAdditionalForMembers: true })` — see [dashboard-account/frontend.md](../dashboard-account/frontend.md).

> **Code-review fixes (2026-07-04):**
> - **`Header`** — the added `useUserMajorDrawStats` is now GATED on the package-detail modal being open (`packageDetailModalData ? userData?._id : undefined`). It was firing `/api/major-draw` every 60s for every authed user on every page (the Header is globally mounted) to feed a click-only modal; the query is disabled until the modal opens.
> - **`DashboardGuestPanel`** — `MIN_PACK_PRICE` guards the empty-array case (`prices.length ? Math.min(...) : 25`) so it can't render "$Infinity" if the catalog ever has no public one-time packs.
> - **`PartnerPreview`** — hoisted the duplicated `isOneTime || pastDueWithPack` into `const accentSub`.

> **Partner-% tier-mismatch fixes (2026-07-04):** the `SubscriptionExplainerModal` "How it works" popup for a Foreman member showed **50% partner offers + a Tradie chart** (header/entries were Foreman). Root cause: the popup's `%` and chart came from `selectedPackageId` = the raw `subscription.packageId` (the *billed* tier — Tradie during a downgrade-preservation window), while name/entries came from the *effective* package. Fixed at the caller ([`my-account/page.tsx`](../../src/app/(site)/my-account/page.tsx) derives `selectedPackageId` from the effective `pkg` via `derivePlanIdFromPackage(pkg, "subscription")`) and hardened the modal (its `%` fallback appends `-subscription` to the tier — a bare "Foreman" would resolve to the one-time ladder's 55%). Same class fixed in `PackageDetailModal`: its `%` used `packageData._id ?? packageData.name` (a weaker derivation than its chart's `toChartPackageId`), so a name-fallback subscription would show 55% beside a Foreman chart — now the subscription `%` uses the same normalized `chartPackageId`. **General rule:** `getPartnerCatalogAccessPercentForPlanId` only returns the subscription mapping when the id contains "subscription" — always pass `\`${tier}-subscription\`` / `derivePlanIdFromPackage(pkg, "subscription")`, never a bare name or raw `subscription.packageId`, for a subscription display.

> **Flow-verification fixes (2026-07-04):**
> - **`PartnerPreview`** deal-row accents (See-all link, letter badges, discount amounts) now use `accent` (teal for one-time, amber for past-due-with-pack, tier hue for active) instead of a hard-coded `tierHex ?? "#ee0000"` — so a one-time buyer's widget is coherently teal (matching `RewardsPartnerCard`) instead of a teal ring beside red/yellow deal accents.
> - **`RewardsClaimables`** empty-state copy no longer says "Keep your membership active to earn more" (wrong for a one-time buyer, who has no membership) — neutral "Rewards you earn will appear here."
> - **`MembershipCurrentPlan`** reads entries from the persisted `subscriptionPackageData` for past-due (was 0 via `getActivePackage`) and gates "Auto-renews monthly" on `autoRenew`. Takes `subscriptionTier*` from the page. See [dashboard-account/frontend.md](../dashboard-account/frontend.md).
> - **`PastDueTierSwitchModal`** gained an `onRecovered` prop — on 409 `SUBSCRIPTION_RECOVERED` it hands back to the page to refresh instead of showing the positive server message inside a red error box.

> **Flagged-finding fixes (2026-07-04):**
> - **`MembershipSection` past-due one-time consistency** — the shared `/membership` section's `handlePlanSelect` bounced ALL past-due taps to `/my-account`; now scoped `&& isSubscriptionPlan` (matching `useMembershipCardCta.onSelect`), so a past-due member can buy a one-time/Additional pack on the public page too. See [subscription/gotchas.md § Both surfaces scoped](../subscription/gotchas.md#money-path).
> - **Canonical `PAST_DUE_AMBER`** — the amber accent (`#d97706`) now has one source of truth in [`tier-visuals.ts`](../../src/utils/membership/tier-visuals.ts), consumed by `MembershipTierList` (border), `PartnerPreview`, and `RewardsPartnerCard` (was re-declared/hardcoded in each). Tailwind arbitrary-value class strings (the "Current · Past due" pill, gradient buttons) keep their literals — a JS const can't feed a Tailwind bracket at build time.

> **User-flow audit fixes (2026-07-03):** a multi-agent audit found the one-time-pack flag bug was a *pattern*. Fixed siblings:
> - **`PartnerPreview`** — was `locked = acct === "pastdue"`, wrongly showing "Paused / 🔒 / 0%" for a past-due member who still holds a live one-time pack. Now mirrors `RewardsPartnerCard`: `pastDueWithPack = acct === "pastdue" && partnerAccessPct > 0`; only truly locks a past-due member with **no** live pack, else shows the real % + "N% active · from your pack · membership paused" + the deal glimpse. The home widget and Rewards page now agree.
> - **`RewardsClaimables`** — was `disabled = acct === "pastdue"`, forcing `claimableCount` to 0 and every Claim button to "Paused" for ALL past-due members. But the server's per-item `isRedeemableNow` already gates membership coupons on an active subscription (`hasQualifyingPurchase`), so milestone rewards + none/one-time/any coupons are genuinely claimable while past-due (the redeem endpoint enforces the same predicate). Dropped the blanket disable (and the `acct` prop) — claimability is now purely `isRedeemableNow`; membership-gated items still show "Members only".
> - **`Header`** (`PackageDetailModal`) — `hasAccessToAdditionalPackages` was `subscription?.isActive === true`, omitting the "current-draw entries" half of the rule, so a one-time/past-due entrant with entries was denied the discounted one-time-packs CTA. Now uses the canonical `hasAdditionalPackageAccess(userData, useUserMajorDrawStats(...))`, matching `my-account/page.tsx`.
> - **`DashboardGuestPanel`** — "packages from $10" was stale (cheapest is Apprentice $25); now derived from the catalog (`min` of active public one-time packs).

### RewardsPartnerQueue — partner-discount queue (2026-07-03)

[`RewardsPartnerQueue`](../../src/components/sections/rewards/RewardsPartnerQueue.tsx) is the Rewards-tab
section that makes the "**highest-% pack is always active, the rest queue**" model legible. Data comes
from the existing [`usePartnerDiscountQueue`](../../src/hooks/queries/usePartnerDiscountQueue.ts) hook
(`GET /api/partner-discount/queue`) — a clean rebuild of the presentation, **reusing** that data layer
rather than the old dark collapsible [`PartnerDiscountQueue`](../../src/components/features/PartnerDiscountQueue.tsx).
It renders: the **active pack** (tier-themed via `getMembershipSectionColorScheme(...).accentHex` + `inkOn`,
a live `useLeafTimer` countdown, and a catalogue-% `AccessRing`); an **"up next" list ranked by catalogue
%**, each row showing the pack's own duration + when it takes over; and a footer with the total queued
window. The per-item **"activates in ~Xd · date"** and footer **"access runs through {date}"** are derived
client-side (active remainder + cumulative queued durations) — the API returns queued items in activation
(highest-%) order. The up-next list lives in its own `max-h-[248px] overflow-y-auto` box so the section
never runs away vertically. Renders `null` when there's no active pack and nothing queued. Mounted on the
Rewards page for non-guest accounts. **Collapsed by default** (a clickable header with a glanceable
summary — active pack · % · N queued — + a chevron) so it doesn't push the page down; the active card /
explainer / up-next / footer are gated on expand. The up-next **% chip is a solid tier-accent chip with
`inkOn` auto-contrast text** (a pale-tint + accent-text chip was unreadable for light tiers like Tradie),
and `cleanName` also strips the trailing "(Mini Draw)" scope suffix so tier names don't truncate mid-word.

> **Entries framing: "/ mo" base vs one-time boost + on-demand explainer (2026-07-15):** fixes the
> promo multiplier being shown as if it were a recurring monthly rate. The 10×/5× multiplier is a
> **one-time grant at join/resubscribe/upgrade** — renewals always grant the tier's **base**, accumulating
> (`calculateRenewalEntries`) — so "150 / 400 / 1000 free entries **/ mo**" over-stated what a member keeps
> receiving and contradicted the upgrade modal ("40 / cycle" + "+475 to start"). Now in `MembershipTierList`:
> the **current** tier shows its **base** rate only ("{base} free entries / mo", no strikethrough — it's what
> renewals grant); an **upgrade/join** target keeps the strikethrough + "{promo}× entries" flame badge but
> reads "~~{base}~~ **{boosted}** free entries **to start**" (was "/ mo"). In `MembershipCurrentPlan`: the
> "Free entries / mo" stat gained an **ⓘ** button that re-opens `SubscriptionExplainerModal`
> (`requestModal("subscription-explainer", true, …)` — `force` bypasses the once-per-account `hasSeenExplainer`
> gate; `entriesPerMonth` is the card's own displayed base so the modal's stat matches the tile), plus an
> **accumulation hint** under the stat grid — "Free entries accumulate each month — **{N}** land on your
> renewal, {date}" where `N` = `entriesPerRenewal` (`dash.membershipEntriesPerRenewal`, the same accumulated
> renewal grant the Dashboard EntryWallet shows), rendered for **active + auto-renewing** members only.

> **"Free entries" copy + portal gate (2026-07-03):** `MembershipTierList` (tiers + one-time packs)
> now says "**{n} free entries**" (was a bare "entries") — packages *grant* free entries, so that's the
> correct framing everywhere. Recurring **tiers** append "**/ mo**" ("{n} free entries / mo") since the grant
> repeats monthly; **one-time packs** stay "{n} free entries" (single grant). Its header row also carries a
> "**✓ Cancel anytime**" reassurance (emerald, right-aligned) next to "Choose a membership" / "Change your tier".
> Its **one-time packages** section renders `OneTimePacksGrid`, which reuses the **`PackCard`** from the
> public `/membership` "Not subscribing?" section (`MembershipOneTimePacks`) — electric card + CATALOGUE
> ACCESS ring + N-day window + free-entries + promo-multiplier badge (top-right) — instead of the old
> compact scroll cards, so the dashboard packs match the marketing page. `PackCard` also now renders a
> **50%-off coupon badge (top-left, `Ticket` icon)** on Additional (member) packs, driven by
> `getAdditionalPackDiscount(plan.id)` (shown on `/membership` too).
> `RewardsPartnerCard`'s "Open partner portal" button is gated on
> [`partnerDiscountSsoEnabled()`](../../src/config/featureFlags.ts) — when off (default, until SSO ships) it
> renders a muted **"Partner portal · Coming soon"** in place of the SSO button. See
> [config-and-data/architecture.md § Feature toggles](../config-and-data/architecture.md#configuration).

### RewardsMilestones — package-themed header (2026-07-03)

[`RewardsMilestones`](../../src/components/sections/rewards/RewardsMilestones.tsx) **dropped the
descriptive paragraph** and leads with a **package-themed header banner** (`glossGrad(tierHex)` fill +
`inkOn` contrast, so it recolors to Tradie / Foreman / Boss) stating the next reward — "Next: +{n} free
entries" / "Unlocks at your {N}-month milestone" + a "{m} /{N} mo" counter (past-due → "Reactivate to
keep your streak"; all-unlocked → "All milestones unlocked"). The visual progress track stays below.
New `tierHex` prop (passed from `dash.tierHex` on the Rewards page). The card is `overflow-hidden`
(to round the banner corners), so the track container carries extra bottom padding (`pb-14`) to clear
the absolutely-positioned node captions ("+50 / 3 MO") — otherwise they'd be clipped at the card edge.
**Coming soon (2026-07-03):** gated on `isDashboardFeatureOn("milestoneProgress")` (the same switch the
dashboard "Milestones" quick-tile uses; currently `false`). When off it renders a **themed "Coming soon"
placeholder** (tier-coloured banner, no unconfirmed `+N` figures / track) instead of the live milestones,
until the milestone-reward figures are confirmed and it's re-flagged.

> **Hero / ribbon / promo polish (2026-07-03):** `DashboardHero` — the "Complete your profile" pill
> became a compact **amber exclamation chip inline with the username** (→ `onCompleteProfile`); for the
> **one-time** state the "ONE-TIME PACK" badge was dropped and "Become a member" is now chip-sized (it
> stands alone). `DashboardAlertRibbon` (one-time) is a **high-contrast teal floating pill** at the
> hero↔entries seam (the content column is pulled up over the hero via `-mt-8`); its copy dropped the
> "Partner access ends in {X}" claim — that's only the *active* pack's window and misleads a buyer who has
> **queued packs** that take over next — for "Become a member for lasting partner discounts, more free
> entries & bonus offers" (leads with the discount, then entries + offers; the `expiryLabel` prop was
> removed and the `Clock` icon swapped for `Sparkles` since it's no longer time-based). Past-due status
> copy now reads "**past due**" everywhere (hero chip "{tier} · past due", ring label "Past due",
> `MembershipCurrentPlan` row "**Payment failed** / Update to resume") rather than "paused", and the hero's
> past-due action is labelled "**Manage membership**" (it opens the Manage sheet). The **past-due**
> state now mirrors that one-time treatment: the hero shows the same right-side `AccessRing` but with a
> `ShieldAlert` "paused" icon (amber) instead of a % + a "Paused" label, the "Update payment" button is
> **chip-sized** to match the "· paused" tier badge (was a large button), the redundant mobile "Past due"
> pill was dropped, and `DashboardAlertRibbon` (past-due) is now the same **floating pill at the seam**
> (amber `#f59e0b→#d97706`, `ShieldAlert`, "Renewal failed — update payment to keep earning entries")
> rather than a full-width box. **Accuracy note:** the past-due copy frames the *future accrual*, not the
> current entries — a past-due member **keeps** their already-earned entries in the draw (verified: winner
> selection has no subscription-status filter, BUSINESS.md §3e), so `EntryWallet` shows the **real
> membership number** for past-due (not a "paused" placeholder) and the total is the honored count. Only
> the Rewards partner card reads "Paused" (partner *access* is a live benefit that does gate on `isActive`).
> **No-access users see NO partner-catalog glimpse:** `PartnerPreview` (home) and `RewardsPartnerCard`
> (Rewards) now **fully hide** the brand deals/grid for no-access states (guest / past-due) rather than
> dimming a teaser — the access ring + unlock CTA stay, the brands are gone. `PartnerPreview`'s access ring
> also shows a **`Lock` icon** (not "0%") when past-due, matching `RewardsPartnerCard`.
> `EntryWallet` also takes `renewalDateIso` + `entriesPerRenewal`: for an **active** member sitting at **0
> membership entries** it shows "**+{N} free entries land on your renewal · {date}**" as a **premium gold
> pill** (gold gradient `Sparkles` chip + gold-tinted gradient bg, matching the wallet's gold accent bar —
> was a plain grey box). The date is the trialing-safe renewal from `subscription.endDate` (see
> dashboard-account/frontend.md).
> `DashboardPromoBanner` puts the offer specifics
> as **gold badges ON the "Get a package" CTA** (`50% off` when `hasAdditionalAccess`, `{n}× entries` when a
> multiplier is live), dropped the big starburst image + the redundant body subtitle, and shrank the heading
> so it doesn't wrap hard. The **SPECIAL PROMO strip** got a premium treatment: a glowing, `animate-pulse`
> flame, a wide-tracked glowing label, and a live **pulsing red-dot "Ends in {timer}" chip**. (The strip's
> own `promo-strip-shine` sheen sweep was removed — it double-shimmered against the whole-banner
> `promo-banner-shimmer`; the keyframe/class were deleted from globals.css.) `DrawHowItWorks` step 1
> ("Get your entries") drops the
> "the more you hold, the more entries you have" tail — the first sentence carries it.

## Dashboard sections (2026-07-02)

The member-dashboard revamp adds section-band components under `src/components/sections/dashboard/`
(home), `src/components/sections/rewards/` (Rewards), `src/components/sections/draws/` (Draws), and
`src/components/sections/account-membership/` (Membership), each a self-contained `"use client"` band
fed by props from `useDashboardState` (no API/DB calls in the components) — mirroring the
`src/components/sections/membership/` pattern. The Membership page also **reuses** the public
`MembershipTierChooser` (driven by `useMembershipCardCta`) for its tier + one-time-pack ladder.

**Pixel-fidelity (2026-07-02):** the home sections were reworked to match the Claude prototype 1:1
for both mobile + desktop. `QuickTile` is now the prototype's glossy `linear-gradient(158deg,…)` chip
(accent palette in [tile-colors.ts](../../src/utils/dashboard/tile-colors.ts)); `EntryWallet` is a
responsive 2-column card with an inline countdown (`CDBox`); `PartnerPreview` uses the letter-badge
deal-row style; `DashboardHero` is single-row on desktop (no gear — sidebar footer has it) and keeps
the existing `AccessRing`. See [dashboard-account/frontend.md](../dashboard-account/frontend.md#dashboard-home--pixel-fidelity-rework-2026-07-02).

**Section refinements (2026-07-02):**
- `DashboardHero` — active-member tier chip renders the real **tier package icon**
  (`getPackageIcon(\`${tierKey}-subscription\`)`) not a crown; the **"Partner portal"** button
  (renamed from "Reward portal" 2026-07-24 — it opens the *partner-discount* portal, and the old
  label collided with the unrelated `/rewards` points page; now matches RewardsPartnerCard's
  "Open partner portal") is a **chip-sized premium gold** pill that **triggers the partner-discount
  SSO** (`onPartnerPortal` → `usePartnerDiscountSso().mutate()` in the home page), not a route; a
  **"Complete your profile"** nudge shows when `profileComplete === false` (new `tierKey` /
  `profileComplete` / `onCompleteProfile` props).
- `DashboardPromoBanner` — the left icon is now the **container-less multiplier badge image**
  (`multiplierBadgeSrc`, shown large like the special-packages modal), falling back to a ticket glyph
  only when no multiplier is live; the redundant button-corner badge was dropped.
- `RewardsMilestones` — now a **visual milestone progress track** (real member-since `months`), no
  longer a coming-soon text teaser.
- `MembershipCurrentPlan` — the plan stat row (entries / partner access / price) is a single unified
  paneled row with dividers instead of three cramped boxes.

**Removed (2026-07-02):** `src/components/sections/MembershipPackagesChart.tsx` — orphaned after both
`/membership` and `/my-account/membership` dropped it (the account page now uses the compact
`sections/account-membership/MembershipTierList`). New shared primitives live in `src/components/ui/`
(`Monogram`, `QuickTile` — see [ui-primitives.md](./ui-primitives.md)). Full detail:
[docs/dashboard-account/frontend.md](../dashboard-account/frontend.md) and the specs under
`docs/superpowers/specs/2026-07-02-*`.

## hikoki-green badge fix + prize combo-render normalisation (2026-06-22)

Two follow-ups after the HiKOKI launch:
- **Badge resolved red instead of green.** `getPackageColorScheme` runs its key through
  `toColorKey`, which maps color keys to themselves via the `PLAN_ID_TO_COLOR_KEY` *identity
  block* — `hikoki-green` was missing there, so `toColorKey("hikoki-green")` fell through to the
  `milwaukee-red` default and the HiKOKI toolset label badge rendered red. Fixed by adding
  `"hikoki-green": "hikoki-green"` to that block. **When adding a new `COLOR_KEYS` value, add its
  identity entry to `PLAN_ID_TO_COLOR_KEY` too**, not just the `Record<COLOR_KEYS>` tables.
- **Prize combo cards displayed at inconsistent zoom.** The 15 combo source images were
  normalised to a single **1600×1200 (4:3)** canvas with the subject trimmed, scaled to a common
  inner frame, and **bottom-anchored + centred**, so every combination shows the setup at the
  same size without cut-off. `PrizeShowcase`'s `getPrizeGalleryImageLayout` also intercepted the
  new combo renders with a uniform `object-contain` layout, *before* the legacy `*-set` rule that
  was zooming dewalt/milwaukee combos to `scale-150`.
  > **2026-07-21:** `getPrizeGalleryImageLayout` was **removed** with the prize gallery. The
  > prize builder's combo hero renders every combination in one fixed `object-contain` stage, so
  > there is no per-image layout table any more. The canvas normalisation above still stands and
  > is what makes that single stage work.

## `hikoki-green` brand color key added (2026-06-22)

The shared color system gained a `hikoki-green` key (HiKOKI brand green `#007749`) for the
new HiKOKI toolset. In `packageColorScheme.ts` it's added to the `COLOR_KEYS` union and every
`Record<COLOR_KEYS, …>` table (`BRAND_GRADIENTS`, `MEMBERSHIP_SECTION_GRADIENTS`,
`LANDING_PAGE_BRAND`, `SCHEMES`, `COLOR_KEY_TO_BRAND_GRADIENT`), plus `slugToPromoTierPlanId`
(hikoki* → hikoki-green) and the `getPackageGlowColor` switch — the `SCHEMES["hikoki-green"]`
entry mirrors `makita-teal` (white text on the dark brand colour) with green substitutions.
`prize-brand-colors.ts` gained `hikoki-*` cases in `getPrizeBrandColors`. `globals.css` adds
`.glow-hikoki` and `animate-border-glow-hikoki`. **Pattern when adding a brand:** mirror an
existing key of the same polarity — light-text-on-bright (ryobi) vs white-text-on-dark
(makita/hikoki).

> **Pruned 2026-07-21.** The prize-builder rewrite deleted the last consumers of several
> `prize-brand-colors.ts` exports, and they were removed with it: `PrizeSpecificationsModalTheme`
> / `getPrizeSpecificationsModalTheme`, `getPrizeSpecificationsModalHeaderSolidFill`,
> `getPowerToolModalPrimaries`, `getBrandGlowClass`, and the `POWER_SPEC_CHROME` map (including
> its `hikoki-green` entry). The module's surviving surface is `PrizeBrandColors` /
> `getPrizeBrandColors` / `getBrandBorderColor` / `getBrandGlowColor`. The specs modal now takes
> its colour as a single `accent` prop → `--pbc-accent`, and the builder's reel cards read each
> brand's own `accent` off the `TOOLBOXES` / `TOOLSETS` record — so a new brand no longer needs a
> case added to a chrome table.

## MajorDrawSection — brand watermark now SVG (2026-06-22)

The Ryobi case of `getBrandLogoPath` now returns `/images/brands/name/ryobiText.svg` (the
brand-name wordmark webps were deleted in the SVG takeover — see `docs/promo/frontend.md`);
the watermark `<Image>`s use `unoptimized` so the SVG serves as-is. The milwaukee / dewalt /
makita cases are unchanged — they use the separate `/images/brands/*.webp` assets, not the
`brands/name/` wordmarks.

## Component categories

See [architecture.md](./architecture.md#categories) for the full inventory.

## Auth-gating conventions (Task 12, 2026-05-20)

Client components must use `usePermissions()` from `@/hooks/usePermissions` for authorization decisions — never read `session?.user?.role` directly in JSX or effects.

- **`Header.tsx`** — The desktop and mobile user-menu dropdowns show "Admin Dashboard" when `isStaff` is true (replaces `userData?.role === "admin"`). Staff still see the same Admin-only branch in the ternary; the `isStaff` signal comes from `usePermissions()` which reads `session.user.userType === "staff"` with a legacy-admin bridge.
- **`LoginModal/index.tsx`** — The post-login redirect (`/admin` vs `/my-account`) uses `isStaff` from `usePermissions()` instead of `session.user?.role === "admin"`. Its password-login error handler also branches on `result.error === "ACCOUNT_DEACTIVATED"` (thrown by `authorize()` for `isActive: false` accounts, 2026-07-09) to show "This account has been deactivated…" instead of the generic invalid-credentials message — mirror this branch in any new login surface (see [auth/gotchas.md](../auth/gotchas.md)).

Display-only `user.role` reads (e.g. the "Admin" badge on user rows in `UsersManagement.tsx` and `UserRow.tsx`) are intentionally NOT replaced — they show the role of the listed user, not the current viewer.

## Cards

### WinnerCard

[src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) renders a winner tile (image, name, prize, draw-type badge). **As of 2026-07-13 it is no longer rendered anywhere** — the homepage `LatestWinnerHero` moved to the shared **Winners Board** tile (`WinnerBoardCard`, see [docs/draws/frontend.md](../draws/frontend.md)), so the homepage, `/winners`, and the draw-results wall now share one card. Only its exported `WinnerCardData` type (`= WinnerSummary`) is still imported (by `WinnerTestimoniesClient`); the component below is retained as reference and is safe to delete once that type import is repointed to `WinnerSummary`.

- The top badge reads **`<date>` MAJOR DRAW WINNER** or **`<date>` MINI DRAW WINNER** — date prefix from [`getWinnerDisplayDate`](../../src/utils/winners.ts) (en-AU short format, e.g. `27 APR 2026`), draw-type suffix from `winner.drawType`. The whole label is uppercased and tracked via Tailwind classes; do not pre-uppercase in the helper.
- The whole card is wrapped in a `<Link>`. Clicking anywhere navigates to:
  - `/promotions/${DEFAULT_PRIZE_SLUG}` for major-draw winners (the default promotions page from [src/config/prizes.ts](../../src/config/prizes.ts)).
  - `/mini-draws` for mini-draw winners (the mini-draws listing page, **not** a per-draw deep link).
- `showDrawLink` (default `true`) controls whether the bottom CTA strip ("Explore this promotion" / "View mini draws") is rendered. The card stays clickable either way; the strip is purely visual reinforcement on the `/winners` grid. The homepage hero passes `showDrawLink={false}` and relies on the card-level click.
- Uses a named Tailwind group (`group/card`) on the outer Link so the inner image's unnamed `group-hover:scale` only fires on image hover, not on bottom-CTA hover.

## Sections

### `sections/LatestWinnerHero` — homepage "Latest Winners" (Winners Board, 2026-07-13)

[src/components/sections/LatestWinnerHero.tsx](../../src/components/sections/LatestWinnerHero.tsx) renders the homepage/promotions/my-account "Latest Winners" block. As of perf Tier-2 (2026-07-20) it reads the **shared** [`useWinnersFeed(WINNERS_FEED_LIMIT)`](../../src/hooks/queries/useWinnersQueries.ts) React Query hook (instead of its own `useEffect` fetch of `/api/winners/all?limit=16`) and **slices the most recent 16 client-side** (`BOARD_MAX`). The same hook backs `WinnerTestimoniesClient`, so a page that shows both now makes **one** `/api/winners/all` request rather than two — see [draws/frontend.md § Winner testimony display](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section-2026-06-11). It then renders the shared **Winners Board** grid (`WinnerBoardCard` in a `.lw-grid`) — **2 columns on mobile, 4 on desktop, 8 tiles per page** (a "See More" button pages by 8; once exhausted it becomes a "View All Winners" → `/winners` link). It replaced the previous Embla carousel + `WinnerCard`.

Because the board's `.lw-*` styles are scoped under `.ta-results`, the grid is wrapped in a `<div className="ta-results …">` that (a) self-loads the Archivo/Space-Mono font vars, (b) sets `background: transparent`, and (c) pipes the active promo accent into the board via inline `--accent` / `--accent-2` (so themed promotion pages keep their colour). The heading and the "Join our next giveaway" CTA stay **outside** that wrapper, so they keep their existing site styling. Cards are passed an `href` (major → `/promotions/${DEFAULT_PRIZE_SLUG}`, mini → `/mini-draws`) so the whole tile links to the giveaway.

### `sections/membership/ElectricPackageCard` — live membership card

[`src/components/sections/membership/ElectricPackageCard.tsx`](../../src/components/sections/membership/ElectricPackageCard.tsx) is a **pure presentational** component — no data fetching, no Stripe calls, no context reads. All decisions arrive as props.

**Props:** `plan: LocalMembershipPlan`, `colorScheme: PackageColorScheme`, `state: ElectricPackageCardState` (`{ locked, lockReason?, isCurrent }`), `discount?: { regularPrice, percentOff } | null`, `onSelect: (plan) => void`, `ctaLabel?: string`, `theme?: "light" | "dark"`.

**Key behaviours:**
- Entries strikethrough (`original → display`) renders when `plan.metadata.promoMultiplier > 1` (mirrors MembershipSection logic via a local `readEntries()` helper).
- The **% OFF badge** and regular-price strikethrough live **only in the price block button** — never in the top-right corner (that space is reserved for the promo multiplier badge in the live section).
- CTA button label: `"Current Plan"` when `state.isCurrent`, `state.lockReason ?? "Locked"` when `state.locked`, otherwise `ctaLabel ?? "Enter Now"`. The `ctaLabel` prop allows callers (e.g. `MembershipSection`) to pass computed text such as `"Upgrade to Boss"`, `"Downgrade to Tradie"`, or `"Update payment"` without the card knowing about subscription hierarchy.
- All colour values come from `colorScheme` (`accentHex`, `badgeStyle`, `textGradientStyle`, etc.) — no local colour literals.
- **Tier differentiation:** VIP is distinguished from Boss by gold tone and a crisp polished finish, not by larger text or heavier blur. VIP uses brilliant champagne/white-gold (`#FFDF63` accent) with a sharp double-rim outer shadow and tight glow; Boss uses warm amber-gold (`#E0A019` accent) with a calmer, standard finish. Both tiers share the same font sizes as all other electric tiers.
- **Discount badge:** the price block renders a **swing price tag** (hook ring + string + notched tag body with punched hole) anchored to the top-right of the price button when `discount` is set. The tag is rotated −7° and uses `accent` as its background. The struck regular-price span remains immediately right of the discounted price in the button's `<div>`.
- **`theme` prop:** `"light"` (default — winner of the membership-theme A/B test) renders the branded vivid card background using `colorScheme.bgGradient`. `"dark"` renders the electric dark background; no production caller uses this anymore but the option remains in the type for future revival.

The component accepts two optional badge props: `showBestValue` (renders a `BestValueBadge` in the top-left corner) and `ribbon` (renders a `CornerRibbonBadge` with the given label; ignored when `showBestValue` is true). A promo-multiplier lightning badge (`X2`/`X5`/`X10` webp) appears top-right when `entries.multiplied` is active. These badges are caller-driven — no internal tier logic in the card itself.

This component is used by the live `MembershipSection` for both the membership and one-time tabs.

### MembershipSection card theme — winner shipped (light)

The membership-theme A/B test (`__membership-theme__` sentinel slug) is complete
— the "no theme" arm won. `MembershipSection.tsx` now passes `theme="light"`
unconditionally to every `ElectricPackageCard`, and the card's default theme
is `"light"`. The `useMembershipThemeExperiment` hook, the
`/api/ab-testing/membership-theme-experiment` route, and the
`VariantConfig.membershipTheme.forceLight` field are still in the codebase but
no production component reads from them — they're dormant infrastructure that
can be reused for the next site-wide cosmetic test, or removed later.

Stray `dark:*` Tailwind utilities elsewhere in `MembershipSection` (headers,
empty-state copy) are NOT part of the card theme and still respond to the
global dark-mode schedule/toggle. That was the original intent.

### MembershipSection — diagnostic `package_cta` click event (2026-07-01)

`MembershipSection` emits an A/B `click` `ExperimentEvent` with `{ element: "package_cta" }` on its CTA path, via `useExperimentTracking().trackEvent(...)`. The emission is **guarded** by `experimentId && variantId` — it no-ops on every page where no experiment is active (which, since the 2026-07 packages-design experiment concluded — control won — is currently all of them; the plumbing stays ready for the next promo-page experiment). This is **diagnostic only** — see [docs/ab-testing/promo-packages-design-runbook.md](../ab-testing/promo-packages-design-runbook.md) for why the Bayesian panel (not this click event) was the winner metric.

### MembershipSection — `?packages=` tab pre-select (2026-07-03)

Ad landings can open the packages section on a chosen tab via `?packages=one-time` (or `membership`).
The param is parsed by the shared helper [`packagesTabParam.ts`](../../src/utils/membership/packagesTabParam.ts)
(`MEMBERSHIP_PACKAGES_QUERY_PARAM` + `parseMembershipPackagesTab`) — see
[subscription/frontend.md](../subscription/frontend.md#packages-url-param--pre-select-the-packages-tab-2026-07-03)
for the parser contract. Consumers: `MembershipSection`, `PromoBanner`, and `useMajorDrawEntryCta`
(which also parses the param via the shared helper).

**`MembershipSection`:**
- Reads the param via `useSearchParams()` and seeds the initial `activeTab` (`forcedPackagesTab ?? "membership"`).
- **Guards the user-state override effect:** when a valid param is present, the effect that re-derives the
  tab from `hasActiveSubscription`/`hasAccessToAdditionalPackages` early-returns, so a logged-in
  non-subscriber landing on `?packages=one-time` still opens on One-Time (and a later `userData` change
  can't fight a manual toggle). Absent/invalid param → byte-for-byte the previous behavior.

The standalone `/membership` page (drawer, no toggle) does not read the param.

**Banner sync — `PromoBanner` is a second `activeTab` owner.** It reads the `?packages=` param in its **mount
effect** (via `window.location.search` + the shared parser) and `setActiveTab` to the forced value, so the
multiplier badge matches a forced One-Time landing — independent of any dispatch.

Why `window.location.search` and not `useSearchParams()`: `PromoBanner` renders **outside** the promo pages'
`<Suspense>` boundaries (it sits above them in `[slug]/page.tsx` / `ToolsetLandingPage`), so `useSearchParams()`
there would force the statically-generated routes to de-opt (build error / banner pop-in). Reading in a
client-only effect keeps the banner server-rendered with the `"membership"` default and applies the param
post-mount (a brief flip, consistent with the client-read trade-off) — with no hydration mismatch.

For **post-load manual toggles**: `MembershipSection`'s toggle buttons emit `membershipTabChanged`, so the
banner follows a manual switch.

> Historical: during the 2026-07 packages-design A/B test the treatment arm (`PromoMembershipDesign`) honoured
> the same param via a `useMembershipCardCta({ forcedTab })` option. The experiment concluded 2026-07-06 —
> control won — so the treatment component and the `forcedTab` option were removed.

### MembershipTierChooser — `sectionId` prop (2026-07-01)

[`src/components/sections/membership/MembershipTierChooser.tsx`](../../src/components/sections/membership/MembershipTierChooser.tsx) has an optional `sectionId?: string` prop (default `"membership"`).

The `/membership` page passes no `sectionId`, so its `id="membership"` anchor is unchanged. The prop was added for the 2026-07 packages-design A/B treatment (which passed `sectionId="packages"`); that treatment is gone (control won), so no caller currently overrides the default — the prop remains for any future embedder that needs a different anchor id. `TierCard` is internal to the file again (no longer a named export — its sole external importer was the deleted treatment). `PackCard` (in `MembershipOneTimePacks.tsx`) **is** still a named export, used by `OneTimePacksGrid`.

### Promo treatment layout — removed (packages-design A/B concluded, control won)

Historical: the 2026-07 packages-design experiment's treatment arm, `PromoMembershipDesign`, recomposed `TierCard`/`PackCard` into a promo-specific layout. The experiment concluded 2026-07-06 with the **control** (`MembershipSection` on promotions pages) winning, and the treatment component was deleted — along with `TierCard`'s named export and `PackCard`'s treatment-only `ctaLabel`/`colorHex` props (the CTA-footer render block is gone; PackCard renders as it does on `/membership`). The shared `getPackageColorScheme` palette was never changed by the experiment.

### `sections/membership/MembershipPortalReturnBanner` — rewards-return strip (2026-07-24)

[`src/components/sections/membership/MembershipPortalReturnBanner.tsx`](../../src/components/sections/membership/MembershipPortalReturnBanner.tsx) — a compact dark strip rendered **above the `/membership` hero** for visitors bouncing back from the iGoDirect partner portal (`utm_campaign=rewards-return`). Mounted by `MembershipPageClient` only when `page.tsx` resolved a `portalReturn` context server-side (funnel + data layer: [docs/partner/igodirect-integration-playbook.md §10](../partner/igodirect-integration-playbook.md); page wiring: [subscription/frontend.md](../subscription/frontend.md)). Normal visits render nothing.

**Props:**
- `portalReturn?: PortalReturn` — `{ offerName?, requiredPct?, generic? }`, resolved server-side against the committed catalogue (URL params never rendered raw).
- `onSelectPlan: (plan) => void` — the `useMembershipCardCta().onSelect` path (purchase gate + Klaviyo Started Checkout — correct here: the banner CTA starts a genuine NEW checkout, unlike the Klaviyo-free deep-link).
- `plans: LocalMembershipPlan[]` — promo-applied `[...membershipPlans, ...oneTimePlans]`, so the modal opens with the same entries a card tap would show.

**State source:** `useDashboardState` (queue-reconciled `partnerAccessPct` + `acct` — NOT `UserContext.userData`). **Panel-fix updates (2026-07-24, F-001/F-003/F-004/F-005):** while account state loads the banner renders a same-height **skeleton shell** (eyebrow + pulse bars, `motion-safe:animate-pulse`, `aria-busy`) instead of `null` — the section reserves its space at first paint, so the late-mount 238–364px layout shift is gone and only copy/CTA swap in place. The six-state copy/CTA matrix is a **pure function** — `resolvePortalBannerView` in `src/utils/partner-discounts/portal-return.ts` (tested via `npm run test:portal-return`); the component only renders the returned view. Guest states additionally render "Already a member? **Log in to check your access**" → `/login` (expired-session members must never be pushed to re-purchase). The unlock CTA routes an **active subscriber choosing a subscription plan** (an upgrade) to `/my-account?open=subscription` (the ManageSheet, whose tier taps open the upgrade/downgrade confirm) instead of `cta.onSelect` — which would bounce them to the bare dashboard; all other visitors still open the purchase modal via `onSelectPlan`. The recommended CTA plan is the cheapest package covering `requiredPct` (`resolveUnlockPackagesForLevel`), mapped back to a `LocalMembershipPlan` via `getPackageId`. Catalogue numbers come from the client-safe `partnerCatalogPreview` aggregates (`PARTNER_CATALOG_TOTAL` / `PARTNER_CATALOG_TIER_COUNTS`) — never the server-only offers map. **Round-2 panel fixes (2026-07-28, F-027/F-028/F-029/F-031, then F-043/F-046/F-047/F-048):** a signed-OUT visitor now skips the skeleton entirely — their state is fully server-resolved and `isLoading` for them tracked only `/api/major-draw`, a query the banner never reads (F-047); the paused state names the offer the member came for and its CTA reads **"Resume membership"** (matching the real control in ManageSheet) rather than the vaguer "Manage membership" (F-048); and `PortalBannerAcct` is now `= DashboardAccountState` with no cast, so adding a dashboard state is a compile error here instead of a silent fall-through (F-046). the skeleton is now sized to the **tallest settled variant** (headline `h-[50px] sm:h-[56px]`, sub `h-[62px]`) and mirrors the CTA column's meta line + link when an offer is known — the first pass reserved 24/16px and the hero still dropped up to 114.5px when copy swapped in. The login hint keys on the **session** (`useSession().status === "authenticated"` → `isAuthenticated`), never on `acct === "none"` alone, because that state also covers authenticated users with no active benefits and `/login` would bounce them to `/my-account`. A **past-due member with a live one-time pack** no longer sees "your discounts are off": with `partnerAccessPct > 0` they get "Your pack access is still running" + the payment CTA, and when the pack covers the offer they fall through to the covered state and are sent to redeem it. `offer_name` resolution drops **ambiguous** names (the catalogue has 6 names that exist at two different percents) so they degrade to the generic banner rather than reporting an arbitrary tier.

**Hero spacing when the banner is present (2026-07-28, F-022):** `MembershipHero` takes `hasPortalBanner?: boolean` (passed from `MembershipPageClient` as `Boolean(portalReturn)`). The hero normally carries the fixed-header offset itself, but the banner already clears the header when it renders above — keeping both left a full header-height band of empty gradient between them (measured 86px at 390 / 106px at 1280). With the banner present the hero switches to `pt-8 lg:pt-10` (measured 32px / 40px); the control page is byte-identical to before. **Polish batch (2026-07-28, F-011–F-013):** the catalogue meta line reads "Unlocks **all** 1,833 partner offers" when the recommended plan covers everything (no X-of-X tautology); "See all packages" carries a 44px touch target (`py-[13px] -my-1`); vendor run-on names ("World Heritage Cruises  Strahan  TAS") display comma-joined via `displayName` in `portal-return.ts` — the generated catalogue file stays vendor-faithful. **Second panel-fix batch (2026-07-28, F-006/F-008/F-009):** the covered state's flag-off fallback sub names the member's still-open portal tab (no dead end while SSO is dark); a dedicated **paused** branch shows "Your membership is paused." + resume date (`useDashboardState.pausedUntil`) + a "Manage membership" link to `/my-account?open=subscription` (never an upsell); and the `offer_name` URL fallback is **allowlisted against the catalogue** in `resolvePortalReturn` — only catalogue-matched names resolve (case/whitespace-insensitive) and the catalogue's own name+pct render, so crafted links can no longer put arbitrary text in the banner.

**State matrix (headline + CTA):**
| State | Behaviour |
|---|---|
| Past-due · no live access | "Your membership payment needs attention." + amber **Update payment** link → `/my-account?open=payment` |
| Past-due · live pack, offer NOT covered | "Your pack access is still running." + the same **Update payment** link — never claims the discounts are gone (F-031) |
| Past-due · live pack that COVERS the offer | falls through to the covered state below, so they are sent to redeem it |
| Paused (any) | "Your membership is paused." + resume date when known + **Manage membership** → `/my-account?open=subscription` (never an upsell — access returns on resume) |
| Offer known · guest | "{offer} unlocks at {pct}% access." + **Unlock with the {plan}** (falls back to a scroll-to-`#membership` CTA if no plan resolves) |
| Offer known · authed, short | "You're at {X}% — {offer} needs {pct}%." + unlock CTA + meta line "Unlocks {n} of 1,833 partner offers" + "See all packages" |
| Offer known · authed, covered | "You're set — your {X}% access covers {offer}." + **Open partner portal** SSO button (`usePartnerDiscountSso`), only when `partnerDiscountSsoEnabled()`; flag off → text only |
| Generic · guest | "Unlock the partner catalogue" + scroll CTA |
| Generic · authed | "Back from the partner portal?" (current % + total) + scroll CTA |

**Layout note:** when present, the banner becomes the page's first section and takes the fixed-header offset (`pt-[var(--app-header-h)]`); the hero then **drops its own offset** for `pt-8 lg:pt-10` via `hasPortalBanner`, so there is no duplicate header-height band between them (F-022 — measured 32/40px with the banner vs 86/106px on the control page).

### `features/PartnerDiscountQueue` — tier-themed partner discount card

[`src/components/features/PartnerDiscountQueue.tsx`](../../src/components/features/PartnerDiscountQueue.tsx) renders the collapsible "Partner Discounts" card on `my-account`. Its visual identity is driven by the **active** package (subscription or active one-time period) resolved into `activePackageVisual` → `getMembershipSectionColorScheme(...)`, so the card matches the membership cards' tier colours.

**Collapsed header:**
- The right side shows **benefit chips, not a package icon**. Chip 1: `{partnerCatalogPct}% partner catalog`, filled with the tier `badgeStyle.background` (neutral amber/orange fallback when no active tier). Chip 2: `{shopDiscountPercent}% shop`, an outlined accent pill for active subscriptions — **currently gated off** via the local `SHOW_SHOP_DISCOUNT_CHIP = false` constant because the shop discount is not yet honoured at checkout; flip it to `true` when shop goes live. Chips render only when `summary.hasActiveAccess`.
- The whole bar is tinted to the tier: corner glow blobs + an accent radial wash use `accentHex`; the subtitle takes `accentHexLight ?? accentHex` when a tier theme is present. All theming falls back to the prior neutral dark look when there is no active package.

**Naming:** `cleanPackageName()` strips a leading `"Additional "` (case-insensitive) for **display only** — used for the active-period name and every "Upcoming" queued row. Icon/theme resolution still uses substring tier matching, so stripping the prefix is safe.

**Upcoming (queued) rows:** each row resolves its own tier theme + package icon via `getPackageIconByName(item.packageName, type)` (membership → `subscription`, else `one-time`). The icon tile uses that tier's `badgeStyle.background`; rows with no resolvable package image fall back to the lucide `getPackageIcon(item.packageType)` on the original yellow/orange tile.

### PromoTrustBar — final-hours urgency variant

[`src/components/sections/promo/PromoTrustBar.tsx`](../../src/components/sections/promo/PromoTrustBar.tsx) is the thin strip that sits between [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) and [`PromoPackages`](../../src/components/sections/promo/PromoPackages.tsx) on `/promotions/[slug]` and `ToolsetLandingPage`. Default render: three icon+text trust items (Drawn live · randomdraws.com.au · Drawn every 27th).

**Urgency variant** swaps the bar to a 2-column layout (timer left · rusted plate image right) when the current major draw is within 72h of `freezeEntriesAt`:

| Tier | Window (relative to `freezeEntriesAt`) | Image | Header copy |
|---|---|---|---|
| `finalHours`    | `freeze − 72h` to `freeze − 48h` | `/images/background/promo/finalHours/finalHours.webp`    | `Entries close · Wed 27 May · 8:00pm AEST` |
| `drawnTomorrow` | `freeze − 48h` to `freeze − 24h` | `/images/background/promo/finalHours/drawnTomorrow.webp` | `Entries close · Tomorrow · 8:00pm AEST` |
| `drawnTonight`  | `freeze − 24h` to `freezeEntriesAt` | `/images/background/promo/finalHours/drawnTonight.webp`  | `Entries close · Tonight · 8:00pm AEST` |
| `frozen`        | `freezeEntriesAt` to `drawDate + 12h` | `/images/background/promo/finalHours/drawnTonight.webp`  | `Entries closed · Draw live · 8:30pm AEST` (Lock icon, red) |

Outside that 72h window, or once `now ≥ drawDate + 12h` (cycle has flipped to the next draw), the standard 3-item trust bar renders. If `currentMajorDraw` is missing or has no `freezeEntriesAt`, the standard bar is the safe fallback.

> **Gotcha:** `currentMajorDraw.activationDate` is when *this* draw became active (always in the past for an active draw), NOT when entries lock out. An earlier version used it as a "stop showing urgency" guard, which made the variant never render. Don't reach for that field unless you mean "the start instant of the current draw."

- **Server-fresh first paint.** Both [`/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) and [`ToolsetLandingPage`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) pass `initialMajorDraw={majorDraw}` (from `getCurrentMajorDrawServer()`) so the urgency state is computed against the same server data the hero uses. The client hook (`useCurrentMajorDraw`) would otherwise briefly return stale cached data from a previous draw state — dev-toggling between scenarios exposed this.
- **Tick:** [`useLeafTimer(60_000)`](../../src/hooks/useLeafTimer.ts) — 1-minute interval. The bar shows only the absolute deadline (no live remaining-time readout), so this just drives the tier boundary recalc (Tonight ↔ Tomorrow ↔ Wed 27 May) without per-second re-renders.
- **No ENTER NOW button in the bar.** [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) already renders the ENTER NOW pill above; duplicating it here was rejected during brainstorming as visual clutter.
- **Default-state mobile layout & styling.** Below `sm` the three trust items are content-width and the row is `justify-between`, so "Drawn live" sits at the left, "Drawn every 27th" at the right, and the cert is centred between them. The cert (centre) column no longer grows via `flex-1` on mobile — that collapsed the gaps and stretched the centre column. Clearance from the corner rivets comes from `max-sm:px-5` on the items row (a standard utility, kept off arbitrary values so Turbopack HMR regenerates it reliably); the rivets sit at the shell's padding-box edge, so this row padding pushes the text inward without moving the bolts. From `sm` up the base `sm:flex-1` + `lg:justify-between` spread is unchanged.
- **Corner rivets are responsive.** The brass `Rivet` bolts shrink to 6px and tuck to a 4px inset on mobile (`h-1.5 w-1.5` / `left-1 top-1`), restoring to 8px / 8px-inset from `sm` up. On the short mobile bar the old 8px/8px-inset top and bottom rivets collapsed onto each other in the vertical middle, reading as one centred blob rather than four corner bolts.
- **Mobile cert link must force `text-white`.** The `linkClass` constant carries `text-inherit`; since `cn` is `twMerge`, the last colour utility wins, so on the mobile `<a>` (which applies `labelCn` *then* `linkClass`) the inherited colour beat `labelCn`'s `text-white` and the link rendered as the `bg-white` page's dark body text — black-on-steel. The mobile link re-asserts `text-white visited:text-white` after `linkClass`. The desktop (`lg`) variant is safe because its link is nested inside a `text-white` `<p>`, so `inherit` resolves to white there.
- **Image dims:** native `450×150`, rendered with `next/image` and `style={{ height: "clamp(40px, 8vw, 72px)" }}` so it scales with viewport while preserving aspect ratio. `priority` so it doesn't pop in.
- **Theme:** the timer icon picks up `usePromoTheme().primary`, so per-slug brand themes (RYOBI green, DEWALT yellow, etc.) tint it automatically. The frozen state forces red (`#dc2626`) regardless of theme.

### PrizeShowcase — landing hero is NOT repeated as the gallery's first slide on `/promotions/*` (2026-06-12) — HISTORICAL

> **Superseded 2026-07-21.** `PrizeShowcase` no longer renders an image gallery, so there is no
> `enhancedGallery`, no first slide, and no landing-hero injection to suppress. The
> [prize builder](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21)
> shows one combo hero (`{toolset}-set/{toolset}-{toolbox}.webp`), which is a different asset from
> the landing art `PromoHero` renders — so the duplication this note guarded against can't occur.
> The underlying *rule* still holds for new work: don't repeat what `PromoHero` already renders.

<details><summary>Original note</summary>

`PrizeShowcase` built an `enhancedGallery` that normally injected the mobile landing-hero art (`getLandingHeroImagePaths(activeSlug)`) as the **first** carousel slide. On `/promotions/*` that would double up the hero — [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) already renders the same landing art directly above the showcase. So when `isPromotionsPage`, `enhancedGallery` early-returned `activePrize.gallery` untouched. Evergreen surfaces (home, my-account) had **no** hero above the showcase, so they still got the landing art injected as slide one.

</details>

New light-variant `sidTB` toolset images (`{brand}-sidTB.webp` / `-sidTB-mobile.webp` for dewalt/makita/milwaukee/ryobi) were added to the [landing image manifest](../../src/generated/landingImageManifest.ts) in the same 2026-06-12 change so the dark/light hero pairs are complete — that part is still live.

### PromoHero — hero video gating + A/B `disableVideo` (2026-06-12)

[`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) plays the brand
hero clip (`getLandingHeroVideoPaths`) over the still poster for brand slugs,
suppressing it for reduced-motion / Save-Data users and when a variant pins a
per-slug image. It now ALSO suppresses the video when the assigned variant sets
`hero.disableVideo = true` (the gate is `!perSlugVariantImage && !variantConfig?.hero?.disableVideo`).
This powers the **"static image vs video"** A/B test: the control variant leaves
`disableVideo` false (video plays) and the treatment sets it true (the
theme-aware still renders, no video) — identical creative, motion the only
difference. Seed it with `npm run seed:static-vs-video-hero:dry` (then live). The
flag is declared on `VariantConfig.hero` and validated by `VariantConfigService`.

### PromoHero — drawn-tomorrow / drawn-tonight tier swap + seamless skeleton (2026-06-24)

Two related changes to [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx):

- **Calendar-day urgency tier.** It computes `getLandingHeroUrgencyFromDrawDay(majorDraw)` (a calendar-day AEST tier, distinct from the existing `getMajorDrawHeroUrgencyFromMajorDraw`) and threads it into **both** `getLandingHeroImagePaths(slug, urgency)` and `getLandingHeroVideoPaths(slug, urgency)`. So on the day-before / draw-day the brand hero swaps to its **"drawn tomorrow" / "drawn tonight"** still, and the resolver returns the animated **badge clip** (its drawn still is the poster, so the badge animates in rather than being painted over). Same parity behaviour the PromoBanner left-art got in the 2026-06-12 pass.
- **Video-first hero (no static-first flash).** The clip is the **primary** hero, rendered from the **first paint** (server + client) — not gated behind an `isMounted`/`useDeviceProfile` swap. The old gate rendered the still (the finished art) first and swapped to the video after mount, so users saw the full image *then* the clip restart its build-from-blank intro (the reported "full image → snap to animation" bug). Now `showVideo = heroVideoPaths != null && !videoFailed` decides per render, each viewport renders `<LandingHeroVideo>` (opaque, **no `poster`** — the clips open on a blank frame, so the end-state still is never shown up front) and the still only renders when there's **no clip / the clip failed** (`onUnavailable` → `videoFailed`, reset when the slug/tier changes) or — purely in **CSS** via `motion-reduce:` — for reduced-motion users (a sibling `<Image className="hidden … motion-reduce:block">`; the video carries `motion-reduce:hidden`). This drops the `isMounted` / `isLgUp` / `useDeviceProfile` / `useMediaQuery` gating entirely; reduced-motion is CSS-driven (per `useDeviceProfile`'s own convention) so there is no SSR→client swap. Trade-off: the previous JS Save-Data suppression is gone (no reliable CSS signal); reduced-motion is preserved.
- **Seamless loading skeleton (theme-aware).** The `if (isLoading)` branch no longer renders a gray `bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse` placeholder. It renders the hero **"stage" background** via `resolveLandingHeroBackground(themeMode)` — the bare backdrop the hero art is composited onto, so the load-in is seamless. Keyed on THEME since draw 9; it was per-brand, which served dark-mode visitors the light backdrop with a dark hero painted over it.

### LandingHeroVideo — mp4-only ordered sources, drawn tier falls back to base (2026-06-27)

[`LandingHeroVideo`](../../src/components/sections/promo/LandingHeroVideo.tsx) is now **mp4-only**: the `webm` `<source>` was removed. The new-design base clips ship only `.mp4` (H.264 plays in every supported browser), so the old `webm` source was a dead URL that 404'd on **every** base hero before the browser fell through to the mp4. [`getLandingHeroVideoPaths`](../../src/utils/promo/landing-video-resolver.ts) now returns `srcs: string[]` (an ordered mp4 list) instead of `{ webm, mp4 }`, and the component renders them in order so the browser plays the first that loads. On the **`drawn-tonight` / `drawn-tomorrow`** tier the drawn clip is first with the **base clip appended as a fallback**, so a brand that ships no drawn art — **HiKOKI** has only base clips — still animates via its base clip instead of dropping to the still (the browser advances to the next `<source>` when the drawn one 404s). Mirrors the image resolver, which already drops a missing drawn still back to the base image. (Supersedes the WebM→MP4 / `loop` details in the 2026-06-12 note below.)

### Hear From Our Winners — `WinnersTestimony`, "speech bubble" redesign + `.winner-testimonies` tokens (2026-07-23)

The old `src/components/sections/winner-testimony/` folder and its `src/components/sections/WinnerTestimonySection.tsx` re-export were removed; the section is a single component, [`WinnersTestimony`](../../src/app/(site)/winners/components/WinnersTestimony.tsx) (**draws** domain — full write-up in [docs/draws/frontend.md](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section)). **As of 2026-07-23 it was redesigned to the Claude "speech-bubble" handoff** and no longer uses `.ta-results`, self-loaded Archivo/Space-Mono/Newsreader fonts, or a native scroll-snap carousel — it now uses `font-poppins`, a desktop auto-fit grid + mobile index-based carousel, and a portalled focus-trapped modal.

Shared-ui-side, the redesign adds a self-contained token layer to [globals.css](../../src/app/globals.css): `.winner-testimonies` (section chrome — `--wt-base`, `--wt-eyebrow`, `--wt-heading`, `--wt-heading-muted`, `--wt-nav-*`, `--wt-dot-off`, `--wt-green`, `--wt-avatar-bg`) and `.winner-testimonies-modal` (the portalled modal — `--wtm-*`), each with a `.dark` override, plus the centred `.wt-header` / `.wt-kicker` / `.wt-title` / `.wt-quote` header rules (the "Winners / testimonial" title with red serif quote glyphs), the `wt-overlay` / `wt-panel` / `wt-swap` keyframes, the `.wt-card` / `.wt-nav` / `.wt-readmore` / `.wt-dot` hover rules, and a `prefers-reduced-motion` gate that covers the card/overlay/panel animations plus the `.wt-dot span` + `.wt-readmore` transitions. (The portalled modal themes via a `.dark` wrapper the component adds around the portal — see [docs/draws/frontend.md](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section).) Keyed off the global `.dark` class (NOT `.prize-gallery`), so it themes correctly on any host page with no JS theme read and no hydration flash — same rationale as the prize-builder `--pbc-*` tokens. Call sites: the homepage, the `/promotions` index gallery + `/promotions/[slug]` brand pages via [WinnerTestimoniesClient](../../src/app/(site)/components/WinnerTestimoniesClient.tsx), `/winners` via `WinnersBrowser`, and the account draws tab.

### `PrizeShowcase` / `PrizeBuilderCard` — "Build your prize" (2026-07-21)

Lives in this domain by the manifest (`src/components/sections/**`), but the **architecture
write-up is in [promo/frontend.md](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21)**
alongside the rest of the prize/promo surface — two independent coverflow lanes off the
`TOOLBOXES` / `TOOLSETS` registries, `--pbc-accent` = the selected power toolset, the CSS-variable
reel geometry, the `.pbc-brand-mark` mask technique, and the `/promotions/*` in-place-selection
behaviour (including the `?toolset=`/`?toolbox=` URL sync, 2026-07-27). Read it before touching
any of the `prize-selection/*` files. Shared-ui-side consequences documented here: the
[`.prize-builder` token block](#prize-builder-tokens-in-globalscss) below, the
[PrizeSpecificationsModal](#prizespecificationsmodal) restyle, the pruned `prize-brand-colors.ts`
exports, and the deleted `ToolboxSelector` / `PowerToolsetCarousel` / `StaticToolsetHighlight`
entries in [decomposition-backlog.md](./decomposition-backlog.md).

**Component-level note: the URL sync never uses `router.replace` or `useSearchParams()`.** It
writes with `window.history.replaceState` (via `buildPrizeSelectionHref`) and reads once on mount
from `window.location.search` (via `parseToolsetQueryParam`/`parseToolboxQueryParam`) — same rule
as the CLS fix documented in [shared-ui/gotchas.md](./gotchas.md): `useSearchParams()` on this
prerendered section de-opts it to client-only rendering. `router.replace` is avoided for a
separate reason — it resets scroll on this page even with `{ scroll: false }` (see
[promo/gotchas.md](../promo/gotchas.md)). Full narrative in promo/frontend.md above.

**Component-level note: build tracking (2026-07-27).** `PrizeShowcase` counts toolbox/toolset reel
switches (state only — `toolboxSwitches` / `toolsetSwitches`) and hands the counts, plus the
catalog-resolved `activeSlug`, to [`usePrizeBuildTracking`](../../src/hooks/usePrizeBuildTracking.ts).
The component itself makes no API call — counting and reporting are split so the component stays
UI-only, per the components-don't-call-APIs layering rule. Full beacon behaviour (debounce,
`pagehide` flush, cumulative counts) is documented in
[promo/frontend.md](../promo/frontend.md#build-tracking-beacon--useprizebuildtracking-2026-07-27).

#### Prize-builder tokens in globals.css

[`globals.css`](../../src/app/globals.css) gained a `.prize-builder` block (+ a `.dark
.prize-builder` override) declaring the card's whole surface palette — `--pbc-panel`,
`--pbc-panel2`, `--pbc-text`, `--pbc-sub`, `--pbc-body`, `--pbc-border`, `--pbc-box-bg`,
`--pbc-tile-*`, `--pbc-chip-*`, `--pbc-rule`, `--pbc-heading`, `--pbc-aside-bg`, `--pbc-foot-bg`,
the payment-mark inks (`--pbc-visa` / `--pbc-stripe` / `--pbc-gpay` / `--pbc-ink-strong`) and the
theme-independent `--pbc-cash` / `--pbc-cash-dark` — plus the reel geometry variables (with a
`@media (min-width: 768px)` desktop block), `.pbc-reel-card`, `.pbc-brand-mark` and `.pbc-fade`.

Three rules for anyone editing it:
1. **It is keyed off the `html.dark` class, not the Zustand theme store**, so the right palette is
   in the first server-rendered frame — this section is above the fold on `/` and every promo
   page, and a JS theme read would flash. Don't "simplify" it into a `useTheme()` read.
2. **`--pbc-accent` is deliberately absent from the block.** It is per-selection (the chosen power
   toolset's brand colour, cash green in cash mode) and is set inline on the card root and on the
   specs-modal root. Adding a brand must never touch this CSS.
3. **The reel variables are mirrored by `REEL_METRICS`** in `prize-builder-model.ts` for the unit
   tests. Change one, change the other — `npm run test:prize-builder` cannot see the CSS.

Two blocks were **removed** from `globals.css` in the same change: `.main-swiper` and
`.thumbs-swiper` (the per-brand Swiper nav/pagination/thumb chrome for the deleted prize gallery).
The `.glow-*` brand utilities and `.other-toolsets-swiper` are untouched.

### ~~`OtherToolsetsCarousel` — Explore other toolsets cards~~ (DELETED 2026-07-22)

The "Explore other toolsets" strip beneath toolset / evergreen promo pages was **deleted**: the
prize builder's power-toolset reel now offers every brand on those pages, so the strip duplicated
it one scroll further down. Its supporting exports went with it — `POWERSET_LABELS` (its
`aria-label` source) and `buildPromotionsToolsetLandingHref` are gone, as is the
`.other-toolsets-swiper` CSS block. `POWERSET_IMAGES` and `POWERSET_BRAND_TEXT` survive as derived
maps for the login page's decorative toolset rotator; everything else reads the `TOOLSETS`
registry directly. See [promo/frontend.md](../promo/frontend.md) for the reel that replaced it.

**`TOOLBOX_LABELS`** (same file) are the descriptive all-caps names — `MONSTER MILWAUKEE TOOLBOX`, `470 PIECE KINCROME TOOLBOX`, `356 PIECE SIDCHROME TOOLBOX` — now also derived (`name.toUpperCase()`). Their renderer, `ToolboxSelector`, was deleted in the rewrite; the prize builder's toolbox reel card composes the same information from the record's `eyebrow` + masked brand mark + the literal `TOOLBOX`, and the combo hero caption uses the full `name`. (The `prizes.ts` prize `label`/`heroHeading` strings still say "Milwaukee Toolbox" etc. — a different surface, left unchanged.)

**PromoHero — landing hero video (2026-06-12):** [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) now overlays a muted hero **video** on the landing image for brand slugs. It **plays through once (no loop)** and holds on its last frame — a new clip only plays when the slug changes (the `key` remounts it). The `.webp` hero stays the **LCP element and `poster`/fallback**; [`LandingHeroVideo`](../../src/components/sections/promo/LandingHeroVideo.tsx) fades in over it (`onPlaying` → opacity) once playback starts. Paths come from [`getLandingHeroVideoPaths`](../../src/utils/promo/landing-video-resolver.ts) (`null` for `cash-prize` / evergreen → image only). Gating — the video mounts **only** when all hold: client-mounted (`isMounted`, avoids SSR/hydration mismatch and guarantees autoplay), not `imageError`, **not** `flags.saveData`, **not** `flags.reducedMotion` (both from [`useDeviceProfile`](../../src/hooks/useDeviceProfile.ts)), and no per-slug A/B image override is pinned. Only the **active viewport's** clip mounts (`useMediaQuery("(min-width: 1024px)")` → desktop `2560×1044` vs mobile `1080×1164`), so it never double-loads. `<video>` is `autoPlay muted loop playsInline preload="auto"` with `<source>` WebM→MP4; same-origin under CSP `media-src 'self'`.

**PrizeShowcase gallery — landing hero injection (2026-06-12) — REMOVED 2026-07-21:** `PrizeShowcase` used to prepend the active slug's landing hero (`getLandingHeroImagePaths` / A/B `variantHeroOverride`) as the carousel's first slide (`enhancedGallery`, flagged `isLandingImage`), skipping it on `/promotions/*`. The carousel and `enhancedGallery` are gone with the prize-builder rewrite — the component renders no landing-hero art at all now. Full note above.

## Modals

### AdSpendFocusModal (admin, 2026-07-17)

[`src/components/modals/AdSpendFocusModal.tsx`](../../src/components/modals/AdSpendFocusModal.tsx) — drill-down for the admin Overview's Ad Spend / ROAS KPI tiles: membership vs one-time landing-URL split with a campaign → ad-set → ad tree per bucket. Built on `ModalContainer` (`size="4xl" height="fixed" className="!max-w-[1100px]"`), query gated on `isOpen`, state reset on close, Meta/TikTok platform chips (TikTok = dashed awaiting box until its URL mapping ships). Each `SummaryTile` shows its bucket's **share of total ad spend** (a `{n.n}%` badge beside the spend figure, 2026-07-20) — computed from `spendCents` across all three buckets to avoid float drift, one decimal so tiny buckets don't round to 0%. The tree itself is the admin-domain `CampaignTreeTable` (see `docs/admin/frontend.md` — "Packages-focus drill-downs"). `PrizePerformanceAdsModal` (same folder) was upgraded the same day to reuse that tree with focus chips — documented alongside it in `docs/admin/frontend.md`.

### ChannelDetailModal / PromoPageDetailModal (admin Page Analytics, 2026-07-31)

The two drill-downs behind the admin `promo-analytics` tab. Both changed shape when the tab was
rebuilt — see [docs/admin/frontend.md](../admin/frontend.md#page-analytics-rebuild-2026-07-31) for
the tab side and [docs/promo/backend.md](../promo/backend.md#page-analytics-repair--2026-07-31) for
the API side.

[`ChannelDetailModal`](../../src/components/modals/ChannelDetailModal.tsx) takes **two** props where
it used to take one string: `channel` (a `ConvertingPlatform` — the canonical key the API filters
on) and `channelLabel` (the human string). The split is load-bearing: the route's query param is a
closed `z.enum`, so passing the label would 400. Every user-visible string — title, subtitle, the
Visits card subtitle — uses `channelLabel`; the query uses `channel`. It also renders a new
**"Traffic sources"** chip strip from `data.rawSources` (raw `utm_source` + visit count, `(none)`
for absent), with inline copy stating those are per-source uniques that may sum above the visit
total — they exist to audit what folded into e.g. Facebook / Instagram, not as an addend.

[`PromoPageDetailModal`](../../src/components/modals/PromoPageDetailModal.tsx) dropped its
"Visits from other landing pages" panel (`visitsFrom` no longer exists — its writer, the "Explore
other toolsets" carousel, was deleted 2026-07-22) and gained a **"Prize builds"** card: three chips
(Saw a combination / Changed it / Page default) above the admin-domain
[`PrizeBuildBreakdownTable`](../../src/components/admin/promo-analytics/PrizeBuildBreakdownTable.tsx).
The card's own copy states the chips are deliberately **not** the table's column totals, because a
visitor who landed more than once can appear under two combinations.

Both are listed in `ModalsGalleryClient` (`/dev` modal gallery); the `ChannelDetailModal` fixture
passes `channel="google"` + `channelLabel="Google"`.

### PrizeSpecificationsModal

[`src/components/modals/PrizeSpecificationsModal/`](../../src/components/modals/PrizeSpecificationsModal/) shows the full spec breakdown for a prize (`prize?: PrizeCatalogEntry`). Built on `ModalContainer` (`size="4xl" height="auto" mobileFullBleed`).

**Restyled to the prize-builder handoff (2026-07-21).** It is now the details sheet *behind* the
[prize builder](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21) and
shares its visual system: the modal root carries the **`prize-builder` className**, so the whole
`--pbc-*` token layer in [`globals.css`](../../src/app/globals.css) applies, and the sheet
re-tints with whatever combination the card is showing.

**Props** — `{ isOpen, onClose, prize }` plus three optional additions:

| Prop | Purpose |
|---|---|
| `accent?: string` | The configured combination's accent (the selected **power toolset**'s brand colour, or cash green). Set inline as `--pbc-accent` on the sheet's root; drives the active tab pill, the summary banner's left rule, stat dots, focus rings and the "Got it" button. Defaults to Tools Australia red `#ee0000` for callers outside the builder (e.g. the dev modal gallery). |
| `comboImage?: string` | The composite `{toolset}-{toolbox}.webp` the card is showing; falls back to `prize.gallery[0].src`. |
| `drawLabel?: string \| null` | `"27 JUL · 8PM AEST"` from `formatMajorDrawChipUtc`; appended to the footer permit line, omitted when null. |

**Structure** — `index.tsx` (orchestrator) + `FeaturePanel` + `TabBar` + `SpecCard`.
`Hero.tsx` and `TrustBar.tsx` were **deleted**; the sheet no longer reuses the `upsell-shell`
primitives, and it no longer resolves a landing-hero image or reads
`getPrizeSpecificationsModalTheme` (that helper and its siblings were removed from
`prize-brand-colors.ts` — see below).

- **Desktop (`lg+`)** — two columns: a **feature rail** on the left (`lg:w-[34%]`,
  `--pbc-aside-bg`, non-scrolling) and the spec pane scrolling on the right.
- **Mobile (`<lg`)** — single column: the **same** `FeaturePanel` renders inline at the top and
  scrolls away behind the sticky tab row. One component both times, so the two can't drift.

**`FeaturePanel`** ("EVERYTHING YOU'D WIN") shows the combination composite on a light plate
(`aspect-[16/7]`, `lg:aspect-[4/3]`) with a `+ $5,000 CASH` flag, the combination title, and stat
rows (`Power tools` / `Storage` / `Cash bonus`). The tools + storage strings come from
`getContentsChips()` in `prize-builder-model.ts`, and the title from the slug via `fromPrizeSlug`,
so the sheet and the card always describe the same thing. The dollar `prizeValueLabel` badge is
still **deliberately not shown** (2026-06-02) — surfacing the prize's cash value was judged to
risk putting entrants off; the data is kept for the admin `MajorDrawManagement` surface.

**Import boundary:** `index.tsx` imports `constants.ts` and `prize-builder-model.ts` as **leaf
modules**, not through the `prize-selection` barrel — both are pure data / pure derivations, so
the sheet shares the builder's vocabulary without dragging the card's component tree into this
click-gated chunk.

**Tabs** — `TabBar` is a sticky (`top-0`), single-row, horizontally scrollable `role="tablist"`
wired to the pane's `role="tabpanel"`. Each pill shows its section's **item count badge**; the
active pill is filled with `--pbc-accent`. It carries `lg:pr-14` so the absolute modal close
button never sits over the last tab. A `$5,000 Cash` section is appended to `prize.specSections`
for every non-cash prize.

**`SpecCard`** — an **84×84** `object-contain` thumbnail (`item.image`, a `PrizeMedia`) beside the
item name, then a two-column **Specifications / In the Box** body. Photos are wired in
[`prizes.ts`](../../src/config/prizes.ts) (see config-and-data domain) — items with no matched
photo fall back to a placeholder glyph. Storage sections lead with the composite system photo on
the primary (rolling-base) piece (Makita MAKTRAK, Ryobi LINK); Milwaukee PACKOUT / DeWalt
ToughSystem / HiKOKI Multi Cruiser have no storage photo on disk.

**Footer** — the NTP permit line (`NTP_NUMBER` from [`src/constants/legal.ts`](../../src/constants/legal.ts))
+ the randomdraws.com.au attribution + the optional draw stamp, with a `--pbc-accent` **"Got it"**
button. This replaced the old 3-cell `TrustBar`.

**Click-gated since perf Tier-2 (2026-07-20):** `PrizeShowcase` mounts it via `next/dynamic` behind a first-open latch and resolves the deep `PrizeCatalogEntry` with `await import("@/config/prizes")` at open time — the modal's `prize` prop is `null` until that lands (it renders its built-in "Prize information is loading" state). The modal's own `@/config/prizes` imports are **type-only**. See [promo frontend](../promo/frontend.md) "PrizeShowcase — prize-summaries split".

**Scroll-finder footgun:** `ModalContainer.findScrollableElement` matches the first descendant whose class string *contains* `overflow-y-auto`. The desktop feature rail is an `<aside>` with **no** overflow class (its content fits), and the spec pane is the only `overflow-y-auto` descendant, so the boundary-overscroll handler binds where it should. If the rail ever needs to scroll, give it `lg:overflow-auto` (never `lg:overflow-y-auto`) — otherwise on mobile, where the rail is `display:none`, the finder falls through to it and `preventDefault`s all touch scrolling.

### RenewalFailedModal

[`src/components/modals/RenewalFailedModal/`](../../src/components/modals/RenewalFailedModal/) (Plan 3 Phase 1 complete) handles failed subscription renewal payments. Entry point: `index.tsx` (orchestrator, 587 LOC). The former 1,292-line monolith `RenewalFailedModal.tsx` has been deleted.

**Public interface** — `{ isOpen: boolean; onClose: () => void }`.

**State (13 slices):** `paymentState` (null or `{ requiresConfirmation, clientSecret?, paymentIntentId?, amount?, currency?, invoiceId? }`), `requiresDifferentPaymentMethod`, `isLoading`, `isSuccess`, `error`, `errorDetails`, `selectedPaymentMethod`, `terminalCollectionFailure`, `showInlineCardSetup`, `setupIntentSecret`, `loadingSetupIntent`, `forceChargeProcessing`, `forceChargeResult`. All reset on `isOpen` becoming `true`.

**Three render branches:**
1. `isSuccess === true` — success Shell (tone: "success") with "Payment received" eyebrow.
2. `paymentState?.requiresConfirmation && clientSecret` — confirmation Shell (tone: "danger") with `<Elements key={clientSecret || "no-secret"}>` provider wrapping `PaymentForm`. Hardcoded Stripe appearance (not `membershipStripeAppearance`).
3. Default — initial/inline-card/terminal Shell. Eyebrow/title/sub copy varies by `terminalCollectionFailure`, `showInlineCardSetup`.

**Callbacks:**
- `handleResolvePayment` — calls `payFailedInvoiceMutation.mutateAsync()`. On success: `setIsSuccess(true)` + `queryClient.invalidateQueries` (user detail + account) + `setTimeout(() => onClose(), 2000)`. On `requiresPaymentConfirmation`: sets `paymentState`. On ApiError with `requiresNewCardPreflight` or missing default PM: `setShowInlineCardSetup(true)`. On `requiresDifferentPaymentMethod`: sets alert. On terminal failure code: sets `terminalCollectionFailure`.
- `handlePayOverdue` — `POST /api/stripe/force-charge-overdue` → sets `forceChargeResult`.
- `handlePaymentSuccess` — `setIsSuccess(true)` + invalidateQueries + showToast + `setTimeout(() => onClose(), 2000)`.
- `handlePaymentError` — sets `error` / `errorDetails` / `requiresDifferentPaymentMethod`.
- `handleBackFromPayment` — clears `showInlineCardSetup` + `setupIntentSecret`.
- `handleCardSetupSuccess` — saves PM, calls `updateSubscriptionPaymentMethod.mutateAsync`, invalidates PM cache, calls `handleResolvePayment`.

**SetupIntent effect** — async IIFE with `cancelled` guard; fetches `POST /api/stripe/create-setup-intent`, sets `setupIntentSecret` on `data.client_secret`. Fires when `isOpen && showInlineCardSetup && !setupIntentSecret`.

**Module-scope:** `stripePromise = getStripePromise()` (singleton). `renewalBillingSupportMailto()` pure helper.

**isNoPayableInvoiceError(errMsg)** — matches "no longer be paid", "no longer payable", "can't be paid", "cannot be paid", "no payable invoice". When true and `!forceChargeResult`, renders amber "Pay overdue amount" CTA inline (calls `handlePayOverdue`). Success: green panel. Failure: red panel.

**Sub-components:**
- **`Shell.tsx`** — dark-hero + white-body modal frame. Props: `isOpen`, `onClose`, `tone?: "danger" | "success"`, `eyebrow`, `title`, `sub`, `children`, `closeOnBackdrop?`. CVA `shellTone` variant; visual tone applied via `data-tone={tone}` activating CSS module rules. Status icon: `AlertTriangle` / `CheckCircle` at 36px. Accent words: `<span data-rf-accent>…</span>`. z-index 80 via inline style.
- **`AlertBanner.tsx`** — CVA `banner` with `warn` (amber) and `error` (red). Props: `variant`, `title?`, `message?`.
- **`PaymentMethodPicker.tsx`** — saved-card radio list + "Enter new payment method" option. Props: `paymentMethods`, `selectedPaymentMethod`, `onSelect`.
- **`ActionButtons.tsx`** — 3-state CTA row: loading spinner, terminal failure (support mailto + account link + close), normal (resolve/back/close). CVA `button` `primary`/`outline`/`ghost`. Uses `styles.btn` + `styles.btnPrimary`.
- **`InlineCardSetup.tsx`** — wraps `<StripeInlineCardSetupForm>` inside its own `<Elements>` provider (key: `${setupIntentSecret}-inline-${isDarkMode?d:l}`). Props: `setupIntentSecret`, `loadingSetupIntent`, `isDarkMode`, `membershipStripeAppearance`, `userData`, `isLoading`, `onSuccess`.
- **`PaymentForm.tsx`** — Stripe confirmation form inside the orchestrator's `<Elements>`. Props: `clientSecret`, `paymentIntentId?`, `amount`, `currency`, `selectedPaymentMethod?`, `onPaymentSuccess`, `onPaymentError`, `onCancel`. Saved PM path: `stripe.confirmCardPayment`. New PM path: `elements.submit()` + `stripe.confirmPayment`. On error: analyzes PI via `POST /api/stripe/analyze-payment-intent`.
- **`styles.module.css`** — `.heroBg`, `.heroStripeOverlay`, `.scrollFrame`, `.btn`, `.btnPrimary`. Tone variables via `:global([data-tone="danger"/"success"])`. Accent coloring via `:global([data-tone]) :global([data-rf-accent]), :global([data-tone]) strong`.

### CancellationUpsellModal

[`src/components/modals/CancellationUpsellModal/`](../../src/components/modals/CancellationUpsellModal/) is the retention modal shown when a member tries to cancel their subscription. The component is now a folder-based module composed of 6 sub-components and an orchestrator:

- **`index.tsx`** — orchestrator; owns all state, effects, callbacks, and the bespoke modal shell. Deliberately does NOT use `ModalContainer` — the full-bleed dark hero design requires bespoke wrapper chrome.
- **`Hero.tsx`** — dark hero band (radial red + gold glow, Anton headline, progress bar, prize banner)
- **`LoseGrid.tsx`** — 3-cell grid: ticket / trophy / calendar cells
- **`Banner.tsx`** — amber encouragement banner ("Someone's name gets called next draw")
- **`ActionRow.tsx`** — primary CTAs ("Keep me in the draw" / "Resolve payment" / "No thanks, cancel anyway")
- **`DowngradeCard.tsx`** — tier-coloured "Switch to X" card (Tradie/Foreman/Boss)
- **`TrustBar.tsx`** — footer trust cells (SSL secure / NTP/17494 — sourced from `NTP_NUMBER` in `src/constants/legal.ts` / Cancel anytime)

### `BrandMark` — mask mode vs duo mode (2026-07-27)

`prize-selection/BrandMark.tsx` renders a toolbox wordmark two ways, and which one it uses is
decided by whether `ToolboxOption.markImageLight` is set.

**Mask mode (default, Milwaukee / Kincrome / Sidchrome).** One white-on-transparent silhouette
SVG painted through a CSS mask (`.pbc-brand-mark` in globals.css), tinted per theme from
`markColor`. One asset serves both themes at the brand's own colour.

**Duo mode (GearWrench only).** A mask paints ONE flat colour and therefore physically cannot
render GearWrench's lockup — "GEAR" in theme ink, "WRENCH" in Molten Orange `#EB8900`, and an
orange gear badge holding a black "GW". So it ships one FINISHED SVG per theme
(`gearwrenchText.svg` / `gearwrenchText-light.svg`), stacked and swapped by `.pbc-brand-mark-duo`
using the same `.dark` ancestor class the mask path uses — pure CSS, no JS theme read, no
hydration flash. Rendered plateless per the Prize Showcase handoff. `markColor` is ignored.

Both consumers (`ReelCards` and `/promotions` `ComboRail`) pass `lightSrc` through, so the reel
card and the gallery thumb can never diverge.
- **`hero.module.css`** — composite gradients, scrollbar chrome, and stripe overlay that don't translate to single Tailwind utilities

Layout is an infographic-style three-band frame: dark hero → white lose grid → light slate trust footer. Layout structure stays identical at every viewport size; the `max-xs:` breakpoint shrinks sizes only (no column collapse). Styles migrated from `<style jsx>` to Tailwind + CSS Modules.

**Props:** `isOpen`, `onClose`, `onRedeem`, `onDecline`, plus optional `isPastDue`, `onResolvePayment`, `accumulatedEntries`, `daysUntilDraw`, `drawCloseLabel`, and `downgrade?: { packageName; saveLabel?; onConfirm }`.

**Three states**, driven by props:
- **Active member with entries** — shows "You've got X entries locked in the major draw." The lose grid shows entries-locked-in / your-shot-at-the-{prize} / your-spot-in-N-days. Stay CTA = "Keep me in the draw" with the gold "+100 BONUS" pill, calling `/api/cancellation-upsell/redeem` ([`canOfferCancellationUpsellRedeem`](../../src/utils/redeemables/cancellation-upsell-eligibility.ts) gates eligibility).
- **About-to-renew (`accumulatedEntries === 0`)** — copy switches to "accumulated entries" wording (since membership entries are earned per cycle), and the spot cell becomes "Renew to keep it".
- **Past-due (`isPastDue`)** — title is "Settle up & you keep", spot cell becomes "Settle up to keep it", and the stay CTA changes to "Resolve payment" with no +100 bonus pill (drops the gold ribbon via `.cm-btn-stay--plain`). Resolves by calling `onResolvePayment` — wired in `SubscriptionManagementModal` to open `RenewalFailedModal`.

**Tier-aware downgrade card** — when a `downgrade` is supplied, the modal renders a tier-coloured "Switch to X" card below the primary actions. Tier is inferred from `downgrade.packageName` and the colour palette mirrors `MEMBERSHIP_TAB_COLOR_MAP` in [`packageColorScheme.ts`](../../src/utils/package-colors/packageColorScheme.ts): Tradie → makita-teal cyan (`#00c2ed`), Foreman → dewalt-yellow (`#ffd200`), Boss → boss-red (`#ee0000`). The package icon (from [`getPackageIconByName`](../../src/utils/images/package-icons.ts)) renders as a tilted top-left corner badge, slightly overlapping the card's rounded corner; the headline + CTA sit on the top row, and a 3-column tick row (`entries stay / Save $X/mo / Cancel anytime`) sits below a dashed-divider footer. On mobile the CTA arrow icon is hidden (`.cta-arrow { display: none }`) so the button stays compact. Clicking "Switch plan" does NOT close the cancellation modal — instead it opens [`DowngradeConfirmModal`](../../src/components/modals/DowngradeConfirmModal.tsx) on top (z-index 90 vs 80). Cancellation modal closes only when the downgrade succeeds or the user explicitly declines.

**Always-positive progress bar** — the "you're this close to a win" bar is always green (`#16a34a`/`#22c55e`) and always renders 13/14 segments filled, regardless of accumulated entry count. The big number under "Active entries" is centred (not right-aligned) — purely positive framing, no comparison signal.

**Hero prize banner + random featured prize text** — the hero shows a single full-width `all-prizes.webp` banner from `/public/images/background/promo/landing/all-prizes/` (no OR divider, no individual prize cards or cash badge). The lose-grid trophy line ("Your shot at the {Milwaukee Combo + $5k cash}") still picks a random non-cash entry from [`PRIZE_CATALOG`](../../src/config/prizes.ts) at modal open via `useMemo([isOpen])` — the slug-derived `formatPrizeShortLabel(slug)` returns `"{Toolset} Combo + $5k cash"`, dropping the toolbox brand to keep the cell within ~3 lines. The "or $10,000 cash — your call" sub-line lives in the trophy cell now that the cash card is gone.

**Data freshness on open** — when `isOpen` flips true, the modal invalidates `queryKeys.majorDraw.current`, `queryKeys.majorDraw.userStats(userId)`, and `queryKeys.users.account(userId)` so we never display a stale entry count or stale downgrade target. The parent `SubscriptionManagementModal` re-runs `fetchSubscriptionBenefits()` on its own `isOpen` flip.

**Wired from `SubscriptionManagementModal`** — that parent owns the cancellation flow and supplies `accumulatedEntries` from `user.subscription.lastMonthAccumulatedEntries`, `daysUntilDraw` / `drawCloseLabel` derived from `useCurrentMajorDraw().freezeEntriesAt || drawDate`, `isPastDue` from `hasFailedRenewal(user)`, `onResolvePayment` opens `RenewalFailedModal`, and `downgrade` from `subscriptionBenefits.availableDowngrades[0]`.

**Mobile** — the frame hides the WebKit scrollbar (`scrollbar-width: none; ::-webkit-scrollbar { display: none; }`) under 540px so the modal looks the same as desktop without a chrome bar. `max-height: calc(100dvh - 8px)` uses dynamic viewport units so the iOS/Android URL bar doesn't push content off.

**Updated 2026-05-07**: copy + state pass — past-due variant ("Resolve payment", no bonus pill); 0-entries variant ("accumulated entries"); switched cash hero to $10k; random prize per open; always-green positive progress bar; centred entries number; cash badge scales down on small screens; downgrade card switched to nested-modal flow (cancellation stays open) and now opens themed `DowngradeConfirmModal`. Trust footer collapsed from 4 cells to 3 (dropped Facebook), restored bold-label + sub-line layout. Lose grid uses `align-items: stretch` + flex-column cells so the 3 cells share the same height. Downgrade card restructured: package icon → tilted top-left badge in tier colours that mirror MembershipSection (cyan/yellow/red); headline + CTA on top row; 3-column tick row at the bottom; CTA arrow hidden on mobile to keep the button slim.

**Updated 2026-05-08**: `CancellationUpsellModal` decomposed from 1,495-line monolith (`CancellationUpsellModal.tsx`) into a folder-based module (`CancellationUpsellModal/index.tsx` + 6 sub-components + `hero.module.css`). The old single-file monolith is deleted; the import path `@/components/modals/CancellationUpsellModal` now resolves to `index.tsx` automatically. All state, effects, and callbacks are preserved verbatim in the orchestrator.

### DowngradeConfirmModal

[`src/components/modals/DowngradeConfirmModal.tsx`](../../src/components/modals/DowngradeConfirmModal.tsx) — themed downgrade confirmation that opens on top of `CancellationUpsellModal` (z-index 90) when a member taps "Switch plan". Visual intensity matches the cancellation modal: dark hero with tier-coloured radial glow + Anton headline, From → To tier comparison cards using `getPackageIconByName`, then a white body with three benefit stats in the order **partner offer access % → days of access → free entries / cycle** (matches MembershipSection ordering), a tick-list of guarantees ("entries stay locked in / keep current benefits / save $X/mo / activates {date} / no refund"), and Cancel + Schedule action buttons. Tier colours (Tradie / Foreman / Boss) are switched via `.tier-*` class modifiers using the same red / silver / gold palette as the cancellation modal's downgrade card. Replaces the generic `ConfirmationModal` previously used for downgrades.

**Props:** `isOpen`, `onClose`, `onConfirm`, `isLoading?`, `fromPackageName`, `toPackageName`, `toPackagePrice`, `toPartnerAccessPercent`, `toPartnerDiscountDays`, `toEntriesPerMonth`, `effectiveDateLabel?`, `currentEntries?`, `saveLabel?`. The parent computes `toPartnerAccessPercent` via [`getPartnerCatalogAccessPercentForMembershipPackageId`](../../src/utils/partner-discounts/partner-catalog-visibility.ts) and the effective date from `activeSubscription.endDate`. On success the parent closes both this modal and the cancellation upsell.

**Sub-components (Plan 3 Phase 2 decomposition in progress):**

- **`Shell.tsx`** — modal frame: backdrop, scroll container, close button, tier-themed `data-tier` frame that cascades all `--tier-*` CSS custom properties to child cells.
- **`Hero.tsx`** — dark hero band: tier-coloured radial glow (`styles.heroBg`), Anton headline, From → To tier comparison cards with package icons.
- **`BenefitsBody.tsx`** — white body section under the hero: uppercase body title (`{toPackageName} benefits from your next billing date`), 3-column stat grid (Partner offers % / Days access / Free entries per cycle), and tick-list of guarantees. All tier-themed cells use `var(--tier-stat-bg)`, `var(--tier-stat-border)`, `var(--tier-icon-bg-light)`, `var(--tier-color-deep)` inline styles that cascade from `[data-tier]`. Tick-list renders conditionally: `currentEntries > 0` → personalised entries count; always renders the keep-current-benefits line; `saveLabel` → savings line; `effectiveDateLabel` → activation date; always renders the no-refund `<Tag>`-icon line.
- **`styles.module.css`** — composite gradients (`heroBg`, `heroStripeOverlay`), scrollbar chrome (`scrollFrame`), button transitions (`btn`, `btnConfirm`), and all `--tier-*` CSS custom properties for the three tiers (tradie / foreman / boss) via `:global([data-tier="…"])` selectors.

**Updated 2026-05-08**: `BenefitsBody.tsx` sub-component created; extracted from original monolith lines 127-160 + 360-434. Stat order: Partner offers % → Days access → Free entries / cycle (matches MembershipSection). Stat num color kept at `#0a0a0a` (matches original CSS, NOT tier-colored). Icon backgrounds use `var(--tier-icon-bg-light)`; icon foreground uses `var(--tier-color-deep)`. Checks list icon color applied via inline style on wrapping `<span>` (replaces original `:global(svg)` CSS selector).

### PaymentMethodSelector

[`src/components/modals/PaymentMethodSelector/index.tsx`](../../src/components/modals/PaymentMethodSelector/index.tsx) wraps Stripe's Payment Element with saved-payment-method selection, wallet support (Apple Pay / Google Pay via Express Checkout), and a hidden-form mount for subscription-invoice confirmation when a saved method is selected. Exposes `confirmStripeIntent()` via `useImperativeHandle` so the parent (`MembershipModal`) can drive confirmation from its own Purchase button.

**Logging is delegated to the parent (2026-05-11).** This component intentionally does **not** call `ErrorLoggingService.logPaymentError` at its `confirmPayment` / `confirmSetup` error branches. Two reasons:

1. The error is always returned via `{ error: string }` and re-handled by the parent (`MembershipModal.handlePaymentError`), which has access to `formData.email` / `guestUserData.email` / authenticated `userData.email` — so the parent's log is always attributed to the right user.
2. Logging at this layer too produces **duplicate "Anonymous" rows** because props don't carry identity down. That defeats the whole point of the admin error reports page.

If you add a new `confirmPayment` / `confirmSetup` call site here, do **not** wire it to `logPaymentError` directly — return the error up and let the parent log it. The noise filter lives at the parent now: see [MembershipModal.handlePaymentError](#paymentmethodselector) → [`isStripeNoiseError`](../../src/utils/payment/stripe/is-stripe-noise-error.ts) → [error-reporting gotchas](../error-reporting/gotchas.md#stripejs-client-side-validation-noise).

### PackageInclusionsExpanded (PackageInclusionsSlideUp)

[`src/components/modals/PackageInclusionsSlideUp.tsx`](../../src/components/modals/PackageInclusionsSlideUp.tsx) — inline expandable that renders full package inclusions cards below the "Click here to see full package inclusion" trigger. Now uses the same colour resolvers and tier overrides as `ElectricPackageCard` and `MembershipSection`: membership tab → `getMembershipSectionColorScheme(plan.id, true)`; one-time tab → `getElectricPackageColorScheme(plan.id)`; same three accent overrides (membership Tradie → electric cyan, membership Boss → electric red, one-time Boss → DeWalt yellow). Card surface is theme-aware via `useThemeStore`: dark → `rgba(13,14,18,0.92)` with tier-glow `boxShadow`; light → `rgba(255,255,255,0.95)` with a soft slate shadow. Feature text uses literal Tailwind classes (`text-white/85` dark, `text-slate-700` light). The old `getPackageColorSchemeForPromo` + `useVariantContext` wiring is removed. Chart (`VerticalAccumulationChart`) and layout structure are untouched.

**Updated 2026-05-18**: dropped `getPackageColorSchemeForPromo`/`variantConfig`; wired to `getMembershipSectionColorScheme` + `getElectricPackageColorScheme` + `useThemeStore`; same tier overrides as live cards.

## Modal architecture sweep — 2026-05-09

Twelve flat-file modals were decomposed into the canonical orchestrator-folder pattern in a single sweep. See:
- Spec: [docs/superpowers/specs/2026-05-09-modal-architecture-sweep-design.md](../superpowers/specs/2026-05-09-modal-architecture-sweep-design.md)
- Plan: [docs/superpowers/plans/2026-05-09-modal-architecture-sweep.md](../superpowers/plans/2026-05-09-modal-architecture-sweep.md)

| Modal | Pre-LOC | Sub-components | Smoke test |
|---|---|---|---|
| [draws/WinnerSelectionModal/](../../src/components/modals/draws/WinnerSelectionModal/) | 452 | 6 | `npm run test:winner-selection` (6 combos) |
| [draws/AdminMajorDrawModal/](../../src/components/modals/draws/AdminMajorDrawModal/) | 731 | 6 | `npm run test:admin-major-draw` (4 combos) |
| [CampaignTargetingModal/](../../src/components/modals/CampaignTargetingModal/) | 603 | 8 (incl. CVA tier chips) | `npm run test:campaign-targeting` (6 combos) |
| [SettingsModal/](../../src/components/modals/SettingsModal/) | 526 | 3 (delegates to Subscription/Payment siblings) | `npm run test:settings-modal` (5 combos) |
| [PackageSelectionModal/](../../src/components/modals/PackageSelectionModal/) | 780 | 4 | `npm run test:package-selection` (5 combos) |
| [RevenueDetailModal/](../../src/components/modals/RevenueDetailModal/) | 731 | 5 + `utils/exporters.ts` | `npm run test:revenue-detail` (5 combos) |
| [UpsellModal/](../../src/components/modals/UpsellModal/) | 1,139 | 5 (Stripe Elements in PaymentSection) | `npm run test:upsell-modal` (4 combos) |
| [SpecialPackagesModal/](../../src/components/modals/SpecialPackagesModal/) | 1,218 | 5 + `utils.ts` (Stripe Elements in PaymentSection) | `npm run test:special-packages` (4 combos) |
| [SubscriptionManagementModal/](../../src/components/modals/SubscriptionManagementModal/) | 1,487 | 7 (embeds 3 child modals) | `npm run test:subscription-management` (5 combos) |
| [PaymentMethodsTab/](../../src/components/modals/PaymentMethodsTab/) | 666 | 3 (Stripe Elements in orchestrator) | `npm run test:payment-methods-tab` (4 combos) |
| [PaymentMethodSelector/](../../src/components/modals/PaymentMethodSelector/) | 1,052 | 4 (forwardRef + imperative `confirmStripeIntent`) | `npm run test:payment-method-selector` (5 combos) |
| [MembershipModal/](../../src/components/modals/MembershipModal/) | 5,891 | 6 (orchestrator still ~3,700 LOC due to wizard breadth) | `npm run test:membership-modal` (5 combos) |

**Hard guarantees of the sweep:**
- Visual output byte-equivalent (no DOM/className/animation/copy changes).
- Public prop interfaces preserved byte-identically — callsites are unchanged.
- `getStripePromise()` resolves at module scope in every Stripe-using orchestrator (UpsellModal, SpecialPackagesModal, PaymentMethodsTab, PaymentMethodSelector, MembershipModal).
- `PaymentMethodSelector`'s `cardFormRef.confirmStripeIntent()` ref API preserved verbatim via `forwardRef` + `useImperativeHandle`.
- 58 new smoke-test combos added (passing); 33 existing-modal regression tests still pass.

**Conventions reaffirmed by this sweep:**
- Orchestrator (`index.tsx`) owns ALL hooks, effects, callbacks. Sub-components are pure-ish presentation taking flat props.
- Folder/`index.tsx` resolution is automatic — folders replace monoliths at the same import path with zero callsite churn.
- `ModalContainer` wrapping is preserved for modals that already used it; bespoke shells stay bespoke.
- Smoke tests run via `tsx --require ./<folder>/__tests__/asset-stubs.cjs <test-file>` and exercise ≥4 prop combos per modal.

**Skip list** (modals NOT decomposed — see spec §Inventory): `AdminProductModal`, `AdminPromoLinkModal`, `AdminMonthlyRedeemablesModal`, `AdminBonusEntryPromoModal`, `AdminPromoBannerTextModal`, `MiniDrawEditModal`, `UserSearchModal`, `ParticipantsModal`, `MajorDrawEditModal`, `UpsellManager`, `AdminScheduledPromoCalendarModal`, `PartnerModal`, `AdminScheduledPromoModal`, `AdminMiniDrawModal`, `AdminAlternatingMultiplierModal`, `SubscriptionExplainerModal`, `ConfirmationModal`, plus modals <300 LOC. All anti-signal protected per [component-decomposition-criteria.md](./component-decomposition-criteria.md).

**Updated 2026-05-27**: `RevenueDetailModal` user rows now expose an explicit **View** button instead of a chevron-only "Actions" column. [`UserRow.tsx`](../../src/components/modals/RevenueDetailModal/UserRow.tsx) renders the View button in the last desktop grid column and at the top-right of the mobile card (calling `onUserClick(user.userId)` with `e.stopPropagation()` so it does not toggle row expansion); the expand/collapse-on-row-click affordance is preserved as an inline chevron next to the user name on desktop and a "Show/Hide purchases" hint on mobile. [`TableHeader.tsx`](../../src/components/modals/RevenueDetailModal/TableHeader.tsx) renames the last column header from `Actions` to `View user` to match. `MembershipByPackageDetailModal` had a redundant `<div className="flex-1 overflow-y-auto">` inside `<ModalContent>` removed — `ModalContent` is already a `flex-1 overflow-y-auto` container, and the inner wrapper was producing a double vertical scrollbar in the membership breakdown drill-down. See gotcha in [gotchas.md](./gotchas.md).

## PromoBanner static left-visual (SpecialPromo, 2026-06)

[`PromoBanner`](../../src/components/sections/promo/PromoBanner.tsx) no longer computes a `scheduledPromoState` (urgent/last-chance) to drive its left image — the `last-chance` / `ends-tonight` static families were retired. It now passes only `drawIsToday` + `within48HoursOfFreeze` + `multiplier` to `resolvePromoBannerLeftVisual`; every non-draw state resolves to `{Brand}/SpecialPromo/special-promo-{3|5|10}x.webp`. See [promo/frontend.md](../promo/frontend.md#static-banner-left-visual-specialpromo-2026-06).

## Z-index ordering

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Always reference these — never use raw numbers.

> **Gotcha:** A full-width fixed bar that only *visually* contains a centered child (e.g. [FloatingGetEntriesButton](../../src/components/sections/promo/FloatingGetEntriesButton.tsx) — `fixed left-0 right-0 z-50 flex justify-center`) still captures pointer events across its entire transparent width, blocking anything beneath it (the bottom-right user icon). Put `pointer-events-none` on the wrapper and `pointer-events-auto` on the actual interactive child so the bar is click-through everywhere except the button.

## Display helpers

- `display-name.ts` — formats user display names consistently across the app
- `brand-utils.ts` — brand display formatting
- `prize-brand-colors.ts` — resolves color tokens for prize / brand contexts

## Image helpers

`utils/images/` — image src resolution, lazy-load helpers, srcSet building.

## Motion

`utils/motion/` — Framer Motion presets and helpers.

**Updated 2026-05-04**: bumped `ToolboxSelector` unselected text to full white for legibility across brand themes; switched `LatestWinnerHero` CTA arrow to inherit `currentColor` so it stays visible in dark mode for light-primary brands. (`ToolboxSelector` was **deleted** on 2026-07-21 — its replacement, the prize builder's toolbox reel, gets its legibility from the `--pbc-*` token layer plus per-theme `markColor` on each `TOOLBOXES` record, so there is no hardcoded white left to bump.)

## Overlays

### FullscreenImageViewer

[src/components/ui/FullscreenImageViewer.tsx](../../src/components/ui/FullscreenImageViewer.tsx)

Fullpage modal for browsing a gallery of winner / prize / draw photos. Used by `MembershipModal`, `WinnerStrip`, `MiniDrawImageGallery`, and the dev modals gallery. (`PrizeShowcase` was a consumer until 2026-07-21 — the prize-builder rewrite deleted its image gallery, so it no longer opens the viewer.)

#### Layout

- **Desktop (≥1024px):** photo column (~62%) + info card column (~38%). Thumbs render as a 3-column auto-fit grid in the info card.
- **Mobile (<1024px):** photo on top (~50vh), info card slides up below with a grab handle. Pull the handle down to reveal more of the photo (peek snap at ~45% of card height). Thumbs render as a horizontal scroll strip.

#### Theme integration

- **Light/dark:** reads `useTheme()`. Backdrop is `#000`/`#f5f5f4`; photo area is `#0a0a0a`/`#fafaf9`; info card gradient flips accordingly.
- **Brand color:** reads `usePromoTheme()`. Applied only to the draw-kind badge, the active thumbnail's border/ring, and the faint tint at the top of the info card gradient. No glow on the close button, chevrons, or thumb wrapper.

#### Behavior

- Pinch + double-tap + mousewheel zoom via `react-zoom-pan-pinch` (max 4×). Carousel swipe is disabled when zoomed > 1× and re-enables at 1×.
- Keyboard: `Esc` closes, `←/→` navigate, `+`/`-` zoom, `0` resets zoom.
- First-open zoom hint pill appears for 2s (or until first zoom interaction), gated by `sessionStorage["fullscreen-viewer-zoom-hint-seen"]`.
- Mobile grab handle: drag the info card down to expose more photo. Snaps between resting and peek (~45% of card height).

#### Props

`FullscreenImageViewerProps`: `isOpen`, `images` (`FullscreenImageItem[]`), `initialIndex`, `onClose`, `title?`, `nested?`. Per-image `captionDetail` is optional (`{ drawName, winnerName, wonDate, drawKind? }`).

#### Companion

`FullscreenTriggerButton` — small expand-icon button used by callsites to open the viewer.

**Module-weight footgun (2026-07-20):** the trigger lives in the SAME module as the heavy viewer (react-zoom-pan-pinch + embla + ModalContainer), so a static import of just the button still pulls the whole viewer into the importer's chunk. `PrizeShowcase` used to work around this with a `next/dynamic` first-open latch plus its own eager markup-identical trigger stand-in; that whole arrangement went with its gallery on 2026-07-21. **The rule still stands for the remaining consumers:** if an eager surface needs the trigger, split the button into its own file instead of static-importing this module.

## SubscriptionManagementModal / PaymentMethodsTab — settings redesign variant (2026-05-19)

Both expose an opt-in `settingsRedesign?: boolean` prop (default false), set **only**
by the settings page wrappers (`SubscriptionTab.tsx` / `PaymentTab.tsx`, alongside
`renderAsPanel`). When true the panel body renders a new presentational component
(`SettingsRedesignSubscription.tsx` / `SettingsRedesignPayment.tsx`) using the Claude
settings design + Phase-1 settings primitives, while ALL hooks/handlers/derived
values/Stripe `Elements`+`stripePromise` singleton/child modals/`ConfirmationModal`
stay in the orchestrators unchanged. Modal-mode callers (`MembershipStatus`) and the
`SettingsModal` panel embed do **not** set the prop, so their render is
byte-behavior-identical. See `docs/dashboard-account/frontend.md` for the full
Phase-2 write-up and the remaining flagged follow-ups.

## Membership Streak surfaces (P3 — 2026-07-07)

Design of record: `claudeDesign/Membership milestone streak design` (Build Kit). All copy: "free entries", no odds language.

- **[LoyaltyStreak.tsx](../../src/components/sections/dashboard/LoyaltyStreak.tsx)** — full rebuild to the Build Kit: tier-tinted **medallion** (conic ring, 30°/level, `--lvl` capped at 12; disc `LEVEL` number), billing-cycle **fuse** (from the real `renewalDateIso`), **tempering rail** (six `Lv.N` rungs from `config/streakMilestones.ts`), and per-state variants — fresh (empty disc + PREV. BEST engrave), active (next-rung pulse + amount pill), milestone-hit (`justHit` banner + gold chip), at-risk (`.dim` medallion, truthful copy, red Update-card CTA — red regardless of tier), paused (steel-frost medallion + glass, prop-ready: no live pause signal in the payload yet), founding (158px full-gradient ring + crown, months ≥ 12). Accent = CSS custom properties (`--s-*`) from `utils/dashboard/streak-display.ts`: tier themes (Tradie/Foreman/Boss) with a **tempered-steel default** (never amber — collides with past-due semantics). Renders the **guest/one-time "Members only" teaser** (Lv.12 medallion + full ladder with amounts + See-memberships CTA) for `acct === "none" | "onetime"`. Keyframes `ta-streak-glowpulse` / `ta-streak-pulse` / `ta-streak-toast` in globals.css, consumed via `motion-safe:` classes. **Rail hover-reveal:** hovering any rung shows its reward pill; the persistent next-rung pill hides via `group-hover/rail:hidden`, where the `group/rail` container wraps ONLY the plates row (gaps included, pt-5 pill headroom outside it) — do not reintroduce `group-has-[…]:hover` here, it flickered/overlapped while the cursor crossed plate gaps. No hover motion on this card (user-removed); press feedback + idle animations only. **Fresh-state copy** says "Every renewal builds your streak" — never "restarts": `fresh` fires for ANY streak-0 member including brand-new joiners (client can't distinguish new vs returned-after-lapse).
- **[StreakCelebrationToast.tsx](../../src/components/sections/dashboard/StreakCelebrationToast.tsx)** — the milestone moment is a **toast, not a modal** (spec §7b M2). Fired by `useStreakCelebration` (once per crossed rung, localStorage-keyed per user), names the receiving draw, `role="status"`. **Visibility is SELF-managed** (run-once 8s auto-hide + X only hide the toast): it takes no `onDismiss`, so dismissing never clears the shared `justHit` state that keeps the in-card banner alive for the session, and parent re-renders can't restart the timer. The rail's next-rung highlight is no longer capped at `months < 12` — year-2+ at-risk/paused members (rail visible, medallion not founding-hidden) get the correct annual-aware next-rung pulse + pill.
- **[EntryWallet.tsx](../../src/components/sections/dashboard/EntryWallet.tsx)** — third **Streak** segment + legend (gold `#fbbf24→#d97706` gradient), rendered only when `entries.streak > 0`; total includes it. Streak entries are never folded into the one-time bucket.
- **[RewardsMilestones.tsx](../../src/components/sections/rewards/RewardsMilestones.tsx)** — the placeholder `[3→+50, 6→+250]` figures are GONE; the track reads the real ladder from `config/streakMilestones.ts` (six nodes at level/12), shows year-cycle position (the ladder repeats annually — month 14 ≡ month 2), and the past-due variant uses the Build Kit's fixed red band + desaturated track.

## (site) layout + homepage shell (2026-07-19)

`src/app/(site)/layout.tsx` and `src/app/(site)/page.tsx` belong to this domain (composition shells over `src/components/sections/**`). The (site) layout no longer exports `force-dynamic` — its Suspense boundaries handle `useSearchParams`, and rendering-mode config in shared layouts is forbidden (it overrides every child page's `revalidate`; see docs/security-csp/architecture.md "Route classes").

## Privacy policy — §7 Cookies & Tracking must name every live provider (2026-07-24)

[`src/app/(site)/privacy/page.tsx`](../../src/app/(site)/privacy/page.tsx) is a static legal page in this domain, but its **§7 Cookies & Tracking** section is a **tracking-domain fact rendered here** — it is the public disclosure of what the site actually loads and sends. It named only the Facebook Pixel while TikTok had been tracking every visitor via pixel **and** the server-side Events API (panel F-012). It now:

- lists **TikTok Pixel** alongside Facebook Pixel / Google Ads in the Marketing Cookies bullet, and TikTok in the third-party providers paragraph;
- adds a paragraph disclosing that **conversion events are shared with Meta and TikTok via their server-side APIs**, with personal identifiers (email, phone) **hashed before sending**.

**Rule when editing this page:** adding, removing, or upgrading a tracking provider (pixel-only → server-side) means editing §7 **in the same change**, plus CUSTOMER.md §8e (rule 5b — customer PII/third-party footprint). The tracking-side statement of this rule lives at [docs/tracking/rules.md R4](../tracking/rules.md); the ground truth for what is actually sent is CUSTOMER.md §8d. The page carries no `dynamic`/`revalidate` export — it stays in the **marketing/static** CSP route class ([docs/security-csp/architecture.md](../security-csp/architecture.md) R8); a production build was run to confirm the copy edit did not flip it to dynamic.

## PixelConsentModal deleted — no consent banner (2026-07-24)

`src/components/modals/PixelConsentModal.tsx` was **deleted** (panel F-019), along with its `UnifiedModalManager` case, its `"pixel-consent"` `ModalType` + priority entry ([client-state](../client-state/patterns.md)), and its dev-gallery entry ([dev-tooling](../dev-tooling/frontend.md)).

It had been **permanently unreachable**: the manager rendered it with a hard-coded `isOpen={false}` next to a `// This would be controlled by pixel consent logic` placeholder, and both its Accept and Decline handlers merely closed it — Decline gated no pixel. Tools Australia deliberately runs **without a consent banner**; `hasPixelConsent()` in `src/components/PixelTracker.tsx` hard-returns `true` ("auto-accept mode"). A consent control that cannot appear, and would not work if it did, is worse than none — it implies a choice the visitor does not have.

**Do not re-add a consent modal as a UI task.** Real gating means pixels must not load until consent, Decline must block both the browser pixels and the server-side CAPI sends, and consent must persist. Full requirements + the expected drop in measured conversions: [docs/tracking/rules.md R9](../tracking/rules.md).

## Discount catalogue components (2026-08-05)

[`src/components/sections/discount/`](../../src/components/sections/discount/) — the section
components for `/discount`. Domain rules, data contract and the reasoning behind the banding
live in [docs/partner/frontend.md](../partner/frontend.md); this entry is the component map.

| File | What it owns |
|---|---|
| `DiscountAccessMeter.tsx` | The gold panel: redeemable vs locked counts, the access bar, the "Get more access" CTA |
| `DiscountFilters.tsx` | Search, sort dropdown, "only what I can use", category chips, and the mobile filter bottom sheet |
| `DiscountOfferList.tsx` | Banded list, band headers, the wall marker, and the offer row |
| `DiscountOfferModal.tsx` | The offer popup and its locked/redeemable gate |
| `DiscountAccessModal.tsx` | "More access" — the level stepper over the two routes |
| `DiscountPrimitives.tsx` | Access bar, artwork plate, category tag, and the two-route block — each used by BOTH the list and the popups |

`DiscountPrimitives` is one file on purpose: four leaves, each too small to earn its own file
and each shared by at least two callers. Anything with its own state or layout responsibility
got a file instead.

**Popups use `Z_INDEX.MODAL_BASE`**, not a local number. They first shipped at a hand-picked
`z-[9500]`, which is above the documented chat-widget layer (9000) but still let the widget
paint over the mobile sheet's sticky CTA. Use the constant.

**Breakpoint-dependent entrance is a media query, not a Tailwind variant.** `.ta-dc-popup` and
`.ta-dc-panel` are hand-authored classes, so `sm:ta-dc-drop` emits nothing and every viewport
silently gets the mobile sheet slide. Both live in `globals.css` with a real
`@media (min-width: 640px)` block.

### `PackageTile` gained `ctaLabel`

[`PackageTile`](../../src/components/modals/PackageTile.tsx) now takes an optional `ctaLabel`.
Default behaviour is unchanged ("Select" / "Selected" / "Current plan"); the override exists
because a tile rendered ALONE as a route to buy is making a different offer than a tile in a
chooser — "Get Foreman" rather than "Select". Selection styling is untouched.

### Header gained a "Discounts" nav entry (2026-08-05)

`Header.tsx` links `/discount` in both the desktop nav and the mobile sidebar, placed
**before** "Become a Partner". The two were reading as the same thing while only the latter
existed: one is a member benefit to browse, the other an inbound business application. Mobile
uses the `Tag` glyph against the partner entry's `Handshake`.

### `/discount` sticky controls, and the body-overflow fix they needed (2026-08-05)

The search + filter row docks under the site header at any scroll depth. Two non-obvious
things make it work, both worth keeping:

1. **`body` had `overflow-x: hidden`, which silently disabled `position: sticky` site-wide.**
   Setting `overflow-x: hidden` forces the computed `overflow-y` to `auto`, making `<body>` a
   scroll container; every sticky descendant then resolves against body's scrollport, which
   never scrolls. `globals.css` now uses **`overflow-x: clip`** — same visual clipping, no
   scroll container. Nothing reads `body.scrollTop/scrollLeft`, so nothing else depended on it.
   Any sticky UI added anywhere in the app depends on this staying `clip`.
2. **The dock offset is MEASURED, not `var(--app-header-h)`.** That constant is the reserved
   padding for the header alone; the dismissible announcement bar above it makes the real
   bottom edge taller, and docking at the constant leaves a strip of page scrolling in the
   gap. The page measures `.site-header header` — the FIXED child, since the wrapper is
   `static, h=0` by design — and re-measures via `ResizeObserver`. It arrives after a Suspense
   boundary, so a `MutationObserver` waits for it; measuring the empty fallback yields 0 and
   docks the bar *behind* the header. Verified flush (gap = 0px) at 390px and 1320px.

## Header IA restructure + nav nudges (2026-08-05)

**Order is by visitor intent, not page inventory:**
`Home · Giveaways▾ · Membership · Discounts · Results▾ · Shop · Explore▾`

Giveaways (the product) → Membership (the conversion) → Discounts (the benefit that justifies
the price) → Results (the proof, read *after* the pitch) → Shop → Explore.

- **`Explore▾`** absorbs Become a Partner, FAQ and Contact. They were peers of Membership while
  serving a different intent, which flattened the nav into "every page that exists". `isExploreActive()`
  keeps the parent lit on any child route.
- **Shop is second-to-last**, deliberately. It is still "coming soon"; a top-three slot pointing
  at an unfinished surface spends the most valuable space on the page to disappoint someone.
- **Results stayed top-level** rather than folding into Giveaways. They are topically adjacent
  but opposite in intent — Giveaways is "what can I win", Results is "did they actually pay
  out". Burying the proof two clicks deep hides it from the skeptical first-timer who needs it.
- **Measured**: 7 items render on one line at 1024 / 1280 / 1440px (max item height 40px, nav
  72px). The previous 8-item row wrapped "Become a Partner" to three lines at 1024 and 1280,
  taking the header to ~85px. Re-check these three widths before adding an item.

**Hover opens the dropdowns** (`openOnHover` / `closeOnHover`), *in addition to* click — click
must keep working for touch and keyboard. Two details are load-bearing: the close is delayed
140ms and cancelled on re-enter, because the panel sits `mt-2` below the button and closing on
the raw `mouseleave` shuts the menu while the cursor is crossing that 8px gap; and the whole
thing is gated on `(hover: hover) and (pointer: fine)`, because a tap fires a synthetic
mouseenter and the same tap's click would immediately close what it just opened.

### The two nav indicators — [useNavNudges](../../src/hooks/useNavNudges.ts)

Both navs read one hook, so the desktop row and the mobile drawer cannot disagree.

| | Discounts | Giveaways |
|---|---|---|
| Kind | **News** — a surface you have not seen | **Status** — a draw is running now |
| Look | static gold dot / "New" pill | red pulsing dot / "Live" pill |
| Dismissible | yes, once | **no** |
| Clears | on ARRIVAL at `/discount` | on its own, when the draw stops being `active` |

Status is not dismissible on purpose: it stops being true by itself, and letting a member mute
it would switch off the one signal that the thing they joined for is happening. Only `active`
counts — a `frozen` or `completed` draw is not something they can act on, and a live dot
pointing at a closed gate is worse than no dot.

The **hamburger inherits** `anyOnMobile` — it is a container, not a subject, so it never carries
news of its own and hides the dot while the drawer is open. Red beats gold when both apply.

**Storage is localStorage, not sessionStorage** — sessionStorage clears on tab close, so a
"new" badge would return on every visit and stop meaning new. `/discount` is public, so the key
falls back to a shared `guest` bucket and re-fires once after sign-in (deliberate: the page
means something different once you have an access level). The `discountNavNudgeSeen_` prefix is
registered in [total-sign-out.ts](../../src/utils/auth/total-sign-out.ts) so it cannot follow
the next person on a shared device.

## Customer-facing noun is "partner discounts", not "partner catalogue" (2026-08-05)

One concept had two names. The package tiles said **"partner discount access"** while the
membership banner, tier cards, rewards card, mini-draw packs, dashboard preview and support
sheet all said **"partner catalogue"** — so the same benefit read as two different products
depending on which surface you landed on.

**"Partner discounts" wins in customer-facing copy.** Twelve display strings were rewritten
(`MiniDrawPackages`, `PartnerDiscountQueue`, `MiniDrawPackageModal`, `PartnerPreview`,
`MembershipEntriesStack`, `MembershipHowItWorks`, `MembershipPortalReturnBanner`,
`MembershipTierChooser`, `RewardsPartnerCard`, `SupportSheet`, the catalogue page title and
its loader), plus Cobber's corpus.

**Code identifiers keep `partnerCatalog*`** — `getPartnerCatalogAccessPercentForPlanId`,
`PARTNER_CATALOG_TIER_COUNTS`, `resolvePartnerCatalogPlanId`, the `/my-account/rewards/catalogue`
route. That is the engine term and renaming it buys nothing but churn; the naming rule asks for
one name *per layer*, and this is the documented split between the two. When adding a customer
string, say "partner discounts". When writing code against the data, say catalog.

## Prize combination browser (2026-08-05)

`MembershipPrizeChooser` showed only the default combo, which made a build-your-own prize look
like a single Milwaukee bundle — and contradicted the bullet directly beside it ("Your pick of
brand"). It now browses all **20** real toolbox x power-tool-kit pairings from
`listPrizeSummaries()`:

- Chevrons over the image, wrapping in both directions (a carousel that dead-ends teaches you
  the boundary by doing nothing when pressed).
- A thumbnail rail so every combo is **directly selectable** — 20 presses to reach the last one
  is a chore, not a choice.
- Opens on the catalogue's featured combo, not index 0.
- Combos with no hero image are filtered out; an empty frame mid-carousel reads as broken.
- The `<Image>` is keyed on src so switching swaps the element instead of holding the old photo
  until the new one decodes.
- Cash has nothing to browse, so the whole control is setup-only.

**Layout trap:** the "Ultimate Tradie Setup" tag is anchored INSIDE the image frame. It used to
hang off the outer column — the same box as the image, until the rail was added below it and
`bottom-3` started measuring from the bottom of the rail, dropping the tag onto the thumbnails.

## `PackageTile` wide variant — compacted so all three tiers fit unscrolled (2026-08-05)

The wide tile exists so the membership modal shows all three tiers at once. It had drifted to
**182px each (573px total)** and was scrolling. Now **152px each (483px total)** — a 90px
saving, with no information removed. What changed, and why each one:

- **Identity band is a single row**: icon + name left, price + period right, baseline-aligned.
  The price used to stack over its period, which forced the band to two lines of type on the
  one variant whose purpose is being short. Band padding drops to `9px 17px`.
- **`was N` moved inline AFTER the boosted figure** ("150 was 15") instead of sitting above it.
  That is the order a member says out loud, and it removed a whole row.
- **Price stays out of the footer column** on wide. That column carries the button plus two
  pills that overlay its top edge (ribbon upper-left, discount tag upper-right); a price row
  there means three things in ~190px *and* another line of height.
- **The access dial shrinks** (48px ring, 8.5px caption at `line-height: 1.1`). It was the
  tallest thing in the stats band because its caption wraps to two or three lines.

- **The multiplier starburst is ABSOLUTE**, pinned to the entries column's upper right. In flow
  it cost height twice: it set the baseline row's height, and once that row ran out of width it
  WRAPPED to a second line and landed on "FREE ENTRIES" — which is how one tile in a set ended
  up 20px taller than its siblings (measured: `"1000" + "was 100" + a 56px starburst` = 178px of
  content in a ~177px column). Out of flow it costs nothing and cannot wrap, whatever the
  number. It stays `wide`-gated and `pointer-events-none`: free of height cost does not make it
  worth repeating across the six-pack compact grid, where it is too small to read.

### The width budget on a wide tile (2026-08-05)

The band is one row of three columns and they trade against each other. Getting the access
dial onto a single line only worked once the CTA column gave width back:

| Column | Was | Now | Why |
|---|---|---|---|
| CTA footer | 190px | **152px** | 190 was generous for a button reading "Select". The two overlay pills still fit: "RECOMMENDED" (~78px) + a discount tag (~40px) inside 152 with the 10px insets. |
| Access dial | 96px stacked | **124px inline** | Ring left, caption right, centred on a shared middle line. Costs the height of the ring alone instead of ring + two or three wrapped caption lines. |
| Entries | ~177px | ~150px | Absorbs the difference. Reserves a 32px lane on the right for the absolute starburst. |

Result: **182px per tile → 145px**, three tiles 573px → 464px, and the hero figure went back
UP to 29px rather than staying shaved at 26.

**The CTA stays 44px tall.** It is the mobile tap target, and the membership tab renders
`compact && wide` on a phone — shortening it to save 4px of tile height would trade an
accessibility floor for almost nothing.

**Verified on the real modal** (`/dev/modals` → PackageSelectionModal), not a mock: three tiles
at 145px each, entries row on ONE line (26px), the starburst clearing the struck value by
36–63px, and every ribbon inside its button.

## `data-cs-mask` — the session-replay masking attribute (2026-08-07)

Any shared component that renders **customer PII as page text** carries a bare `data-cs-mask`
attribute on the element holding that value. Contentsquare session replay masks everything
matching `[data-cs-mask]`; the selector is registered once, before the tag initializes, in
[`ContentsquarePageTracker`](../../src/components/tracking/ContentsquarePageTracker.tsx). See
[docs/tracking](../tracking/) for the mechanism.

Currently tagged in this domain: `Header.tsx` (member + affiliate name/email in the desktop
menu, mobile menu and mobile drawer), `Monogram.tsx` (rendered initials),
`DashboardHero.tsx` (first name, both breakpoints), `BirthdatePicker.tsx` (the DOB trigger
label), `SettingsRedesignPayment.tsx` (cardholder name), `PortalTransit.tsx` (member name),
`Step3EmailVerification.tsx` (echoed email).

Three conventions, all load-bearing:

- **Tag the tightest wrapper around the value, never the card.** Mask `{firstName}`, not the
  greeting containing it — `DashboardHero` keeps "Good morning," visible and masks only the
  name, because a replay where every label is bulleted is useless for UX research.
- **An attribute, not a class list.** A renamed Tailwind class silently *stops* masking and
  nothing fails loudly; an attribute moves with the element through refactors.
- **Do not add it to form inputs.** Contentsquare masks `<input>`, `<textarea>` and
  contenteditable content by default and never collects typed text, so an attribute there is
  noise. This is strictly for text nodes.

`PortalTransit.tsx` is the one imprecise case: `memberName` is `.join(" · ")`-ed with the tier
label and catalogue %, so the whole `<span>` is masked rather than the name alone. Isolating it
would mean restructuring the join. If you touch that line, prefer splitting the nodes.

## Print artwork in the admin product modal (2026-08-19)

`AdminProductModal` can now author `Product.printArtwork`. Until this existed
**no code path anywhere wrote that field**, so every fulfilment CSV line exported
with blank artwork columns and no garment could actually be produced — the API's
Zod schema had accepted `printArtwork` all along; only the form never sent it.

Each row is an image (through the same Cloudinary upload the modal already used),
a placement, and a type of `printing` or `mockup`. Two constraints come from the
consumer rather than the form:

- **`fulfilmentExport` filters to `type === "printing"`.** A mockup is for the
  product page, never for the printer.
- **Placements are the provider's own ids**, and the export's `PLACEMENTS` map
  silently `continue`s past any id it does not recognise. `ARTWORK_PLACEMENTS`
  therefore offers only ids the export can actually send, labelled in the
  admin's language — "Left chest", not `"3"`.

## Admin product modal sizing (2026-08-20)

`AdminProductModal` runs at `size="4xl"` with `mobileFullBleed`, not the default `lg`.

It sat at `lg` (512px) while its own field grids are written as `sm:grid-cols-2` and
`sm:grid-cols-4`. Those are **viewport** media queries, not container queries — so on any desktop
they fired *inside* the 512px shell and the four variant columns got roughly 120px each. The grids
were always written for a wide modal; the shell was the thing that was wrong.

`4xl` is not a new size: `ExperimentDetailModal` and `AffiliateDetailModal` already use it for
large admin surfaces.

`mobileFullBleed` (a `ModalContainer` opt-in) renders near-fullscreen below `lg` and reverts to the
centred dialog above it — worth having on any long form, where a centred card wastes the screen
once the keyboard is up. `OrderDetailModal` takes the same flag but stays `2xl`: it is a
read-mostly detail view, so extra width would only stretch its label/value rows.

### The zero state on "Free entries included" (2026-08-20)

The shared `Input` renders a numeric **0 as an empty box**
(`value={type === "number" && value === 0 ? "" : value}` — [Input.tsx:96](../../src/components/modals/ui/Input.tsx)).
That is right for price-like fields, where an empty box and a zero mean the same thing to an
author. It is wrong for an entry count: merchandise currently sits at `includedEntries: 0` across
the board while entries are off pending the permit, so **every product read as "not configured"**
and the field looked like it had never been wired up.

Fixed at the call site with an explicit placeholder (`"0 — no free entries with this item"`)
rather than by changing `Input`, which would have altered every numeric field in every modal to
fix one field's copy.

Worth remembering as a class of bug: a component that collapses "zero" and "empty" is fine until a
field comes along where the difference is the whole point.

## Product card: price, discount and entry marks (2026-08-20)

`MemberPriceLine` (card variant) now renders the **whole price block**, not a footnote under it.
It was a 12px green line beneath a 20px black one, which put the visual weight on the number a
member does not pay:

```
$85.45   $89.95   [5% OFF]        ← discounted figure is the headline
Tradie price — saves $4.50           struck original, tier-coloured badge
```

The percentage badge takes its palette from the shopper's own tier via
`getElectricPackageColorScheme(packageId)`, so the saving is legibly attached to a membership
level rather than a generic green that ties it to nothing. Non-members see the same treatment for
the best available tier — it is an offer and should look like one. `resolveMemberShopPrice` gained
`packageId`, `fullPriceLabel` and `savingLabel` to support this.

The plain price and the discounted block are **mutually exclusive** (`memberPriceApplies`), so the
two can never both render and disagree about which number is the price.

**Entry marks sit above the price** — they are the reason to choose the item, not a detail of its
cost. `entryMultiplier` arrives already resolved from `/api/products`: the server collapses
product → category → shop-wide because the last two are admin config the browser has no business
holding, and resolving from a partial view is how a card and the product page print different
numbers. Rule 11 applies — entries are a free inclusion, never priced per unit.

### A trap that cost real time here

`String.replace` treats **`$$` in the replacement string as an escaped `$`**. A codemod inserting
`` `$${value}` `` therefore writes `` `${value}` `` — silently stripping the dollar sign from every
price label, including one that was already correct. `tsc` cannot see it and the page renders
"85.45" perfectly happily.

Use a replacer **function** (`replace(re, () => text)`) when the replacement contains `$`, or edit
the file directly. And read the rendered strings back, not just a screenshot — that is what caught
it here.

## The package-inclusions panel is a comparison table (2026-08-21)

[`PackageInclusionsSlideUp.tsx`](../../src/components/modals/PackageInclusionsSlideUp.tsx) — the
panel behind "see full package inclusion" in `MembershipSection` — renders a **table**, not a row of
cards. The question a shopper opens it with is a comparison one, and a comparison spread across
three separate bullet lists is one the reader has to perform themselves.

**Every figure is resolved from the catalog, never parsed from marketing copy.** The old panel
rendered `plan.features` — free text like `"50% Access to Partner Discounts"`. The rows now come
from `getPackageById` plus the same helpers the rest of the app gates on
(`getPartnerCatalogAccessPercentForMembershipPackageId`, `getPartnerCatalogUnlockedCount`), so the
panel cannot advertise a number the platform does not honour.

**The lookup key is `metadata.packageId`, not `plan.id`.** `LocalMembershipPlan.id` is derived from
the package NAME (`"Tradie"` → `"tradie"`), so `getPackageById("tradie")` is undefined *and* the
id-substring tier rules read a bare `"tradie"` as the one-time Tradie pack (40% → 734 offers) rather
than the Tradie subscription (50% → 917). The adapter now carries the catalog `_id` for exactly this
— see [subscription/frontend.md](../subscription/frontend.md).

Row sets differ by tab: the membership tab compares monthly free entries, roll-over, partner offers,
shop discount and cancel-anytime; the one-time tab compares included entries, partner offers, days of
access, and states plainly that **pack entries do not roll over** (BUSINESS.md §5.3). Leaving that
row out is what makes a pack look like a cheaper membership.

Two layout rules learned the hard way:

- **The scroll container is unconditional.** The rounded shell is `overflow-hidden`, so a table one
  pixel too wide loses its last column *silently*. Three columns overflowed at 390px and the Boss
  column simply vanished. `overflow-x-auto` is always on; the `min-w` only applies above three
  columns, so three still fit a phone without scrolling. Assert `table.scrollWidth <=
  container.clientWidth` rather than trusting a screenshot.
- **Tier colour lives in the bar and the icon on a light ground.** The accents are tuned for the dark
  package cards these figures used to sit on — Boss yellow and VIP gold are barely readable on white
  and the gradient headings wash out entirely. Names and ticks fall back to near-black in light mode;
  the colour bar above each column still identifies the tier.

## The cart drawer wears the member's tier (2026-08-21)

The drawer takes the colour of whatever package the member holds — a flowing edge, a
low-alpha wash behind the header, a tinted cart icon, and a `TIER · N% OFF` chip — so the
cart reads as *theirs* rather than as generic chrome.

Every colour comes from a single CSS variable the component sets from
`getRemappedPackageScheme`, the same resolver the package cards and the header badge use.
A tier therefore cannot be painted here in a colour it is not painted in elsewhere. The
styles live in `globals.css` as `.ta-tier-flow` / `.ta-tier-wash` / `.ta-tier-rail`, and
**none of them apply without `--ta-tier`** — a signed-out visitor, or a member on a package
with no shop discount, gets the plain drawer with no extra branches in the JSX.

The flow is a slow gradient drift rather than a bright sweep: it sits under a header the
member reads, and a repeating flash there is a distraction, not a delight. It carries a
`prefers-reduced-motion` gate (CLAUDE.md performance footgun #6) — the rail keeps its
colour, it just stops moving.

The **cart icon badge** shows the item count when there is one and the member's discount
when the cart is empty. An empty badge is dead space, and a member who has forgotten they
get 20% off has no reminder anywhere in the header — but the discount never competes with
the count, which is the more urgent number once something is in there.

## Cobber yields to the side drawers (2026-08-21)

The floating bubble sits bottom-right above page content, which is exactly where the cart
drawer puts **Continue Shopping** — so the robot covered the control and ate the tap.

Both the bubble (`SupportChatWidgetMount`) and the panel (`SupportChatWidget`) now hide
while `isCartOpen || isMobileMenuOpen`, read from `SidebarContext` where that state already
lives. Same reasoning as the existing `/my-account` and dashboard-sheet suppressions: when
another surface owns the screen, Cobber is not the affordance in front of the customer.
