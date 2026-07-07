# Shared UI — Frontend

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
  (`getPackageIcon(\`${tierKey}-subscription\`)`) not a crown; the "Reward portal" button is a
  **chip-sized premium gold** pill that **triggers the partner-discount SSO** (`onRewardPortal` →
  `usePartnerDiscountSso().mutate()` in the home page), not a route; a **"Complete your profile"**
  nudge shows when `profileComplete === false` (new `tierKey` / `profileComplete` / `onCompleteProfile` props).
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
- **Prize combo cards displayed at inconsistent zoom.** `PrizeShowcase`'s
  `getPrizeGalleryImageLayout` now intercepts the new combo renders
  (`<toolset>-<toolbox>.webp`) with a uniform layout (`object-contain`, no per-image scale)
  *before* the legacy `*-set` rule that was zooming dewalt/milwaukee combos to `scale-150`. The
  15 combo source images were also normalised to a single **1600×1200 (4:3)** canvas with the
  subject trimmed, scaled to a common inner frame, and **bottom-anchored + centred**, so every
  prize card shows the setup at the same size without cut-off.

## `hikoki-green` brand color key added (2026-06-22)

The shared color system gained a `hikoki-green` key (HiKOKI brand green `#007749`) for the
new HiKOKI toolset. In `packageColorScheme.ts` it's added to the `COLOR_KEYS` union and every
`Record<COLOR_KEYS, …>` table (`BRAND_GRADIENTS`, `MEMBERSHIP_SECTION_GRADIENTS`,
`LANDING_PAGE_BRAND`, `SCHEMES`, `COLOR_KEY_TO_BRAND_GRADIENT`), plus `slugToPromoTierPlanId`
(hikoki* → hikoki-green) and the `getPackageGlowColor` switch — the `SCHEMES["hikoki-green"]`
entry mirrors `makita-teal` (white text on the dark brand colour) with green substitutions.
`prize-brand-colors.ts` gained `POWER_SPEC_CHROME["hikoki-green"]` (emerald tints), a `hikoki`
case in `getPrizeSpecificationsModalHeaderSolidFill` (`#007749`), and `hikoki-*` cases in
`getPrizeBrandColors` / `getBrandGlowClass` (`glow-hikoki`). `globals.css` adds `.glow-hikoki`
and `animate-border-glow-hikoki`. **Pattern when adding a brand:** mirror an existing key of
the same polarity — light-text-on-bright (ryobi) vs white-text-on-dark (makita/hikoki).

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
- **`LoginModal/index.tsx`** — The post-login redirect (`/admin` vs `/my-account`) uses `isStaff` from `usePermissions()` instead of `session.user?.role === "admin"`.

Display-only `user.role` reads (e.g. the "Admin" badge on user rows in `UsersManagement.tsx` and `UserRow.tsx`) are intentionally NOT replaced — they show the role of the listed user, not the current viewer.

## Cards

### WinnerCard

[src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) renders a winner tile (image, name, prize, draw-type badge) and is consumed by the homepage Latest Winners hero, the recent-winners carousel, and the membership-modal winner strip. (The `/winners` grid and the "Hear from our winners" section now use their own `.ta-results` cards — see [docs/draws/frontend.md](../draws/frontend.md).) Its exported `WinnerCardData` type is still the shared shape (`= WinnerSummary`) used by those feeds.

- The top badge reads **`<date>` MAJOR DRAW WINNER** or **`<date>` MINI DRAW WINNER** — date prefix from [`getWinnerDisplayDate`](../../src/utils/winners.ts) (en-AU short format, e.g. `27 APR 2026`), draw-type suffix from `winner.drawType`. The whole label is uppercased and tracked via Tailwind classes; do not pre-uppercase in the helper.
- The whole card is wrapped in a `<Link>`. Clicking anywhere navigates to:
  - `/promotions/${DEFAULT_PRIZE_SLUG}` for major-draw winners (the default promotions page from [src/config/prizes.ts](../../src/config/prizes.ts)).
  - `/mini-draws` for mini-draw winners (the mini-draws listing page, **not** a per-draw deep link).
- `showDrawLink` (default `true`) controls whether the bottom CTA strip ("Explore this promotion" / "View mini draws") is rendered. The card stays clickable either way; the strip is purely visual reinforcement on the `/winners` grid. The homepage hero passes `showDrawLink={false}` and relies on the card-level click.
- Uses a named Tailwind group (`group/card`) on the outer Link so the inner image's unnamed `group-hover:scale` only fires on image hover, not on bottom-CTA hover.

## Sections

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

### PrizeShowcase — landing hero is NOT repeated as the gallery's first slide on `/promotions/*` (2026-06-12)

[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) builds an `enhancedGallery` that normally injects the mobile landing-hero art (`getLandingHeroImagePaths(activeSlug)`) as the **first** carousel slide. On `/promotions/*` that would double up the hero — [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) already renders the same landing art directly above the showcase. So when `isPromotionsPage`, `enhancedGallery` early-returns `activePrize.gallery` untouched and the carousel starts on the real product photos. Same "don't duplicate what `PromoHero` renders" rule as the PromoTrustBar ENTER NOW note above.

Evergreen surfaces (home, my-account) have **no** hero above the showcase, so they still get the landing art injected as slide one — the early return is gated on `isPromotionsPage` only. New light-variant `sidTB` toolset images (`{brand}-sidTB.webp` / `-sidTB-mobile.webp` for dewalt/makita/milwaukee/ryobi) were added to the [landing image manifest](../../src/generated/landingImageManifest.ts) in the same change so the dark/light hero pairs are complete.

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
- **Seamless loading skeleton (brand-aware).** The `if (isLoading)` branch no longer renders a gray `bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse` placeholder. It renders the hero **"stage" background** via `resolveLandingHeroBackground(effectiveSlug)` from [landing-image-resolver](../../src/utils/promo/landing-image-resolver.ts): a brand-themed slug loads its own `bg-{brand}-{mobile,desktop}.webp`, and cash/evergreen/unknown slugs fall back to the shared `bg-{mobile,desktop}.webp` (per-viewport, manifest-checked). It uses the **same** `object-contain object-top` layout as the loaded hero, so the load-in is seamless with no gray flash. `effectiveSlug` is set on first paint (the `prizeSlug` prop), so the brand background shows immediately even while the draw query loads. The CTA pill still shows a `bg-gray-400/70 animate-pulse` placeholder, and the in-flow CTA-band reserve keeps layout below from jumping.

### LandingHeroVideo — mp4-only ordered sources, drawn tier falls back to base (2026-06-27)

[`LandingHeroVideo`](../../src/components/sections/promo/LandingHeroVideo.tsx) is now **mp4-only**: the `webm` `<source>` was removed. The new-design base clips ship only `.mp4` (H.264 plays in every supported browser), so the old `webm` source was a dead URL that 404'd on **every** base hero before the browser fell through to the mp4. [`getLandingHeroVideoPaths`](../../src/utils/promo/landing-video-resolver.ts) now returns `srcs: string[]` (an ordered mp4 list) instead of `{ webm, mp4 }`, and the component renders them in order so the browser plays the first that loads. On the **`drawn-tonight` / `drawn-tomorrow`** tier the drawn clip is first with the **base clip appended as a fallback**, so a brand that ships no drawn art — **HiKOKI** has only base clips — still animates via its base clip instead of dropping to the still (the browser advances to the next `<source>` when the drawn one 404s). Mirrors the image resolver, which already drops a missing drawn still back to the base image. (Supersedes the WebM→MP4 / `loop` details in the 2026-06-12 note below.)

### Hear From Our Winners — moved to `WinnersTestimony` (2026-06-11)

The old `src/components/sections/winner-testimony/` folder and its `src/components/sections/WinnerTestimonySection.tsx` re-export have been **removed**. The "Hear from our winners" section is now a single page-scoped component, [`WinnersTestimony`](../../src/app/(site)/winners/components/WinnersTestimony.tsx), built in the shared `.ta-results` design system (see [docs/draws/frontend.md](../draws/frontend.md)). It self-loads its fonts and the shared stylesheet is imported globally in [src/app/layout.tsx](../../src/app/layout.tsx), so it renders identically on any host page.

All previous call sites now render `WinnersTestimony` directly: the homepage + promotions via [src/app/(site)/components/WinnerTestimoniesClient.tsx](../../src/app/(site)/components/WinnerTestimoniesClient.tsx), and the account draws tab via [src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx). The old brand-theme/Embla machinery (`usePromoTheme`, `theme.ts`, cinematic photo hero) is gone — the new section uses the fixed brand-red `.ta-results` tokens and a native scroll-snap carousel.

### `OtherToolsetsCarousel` — Explore other toolsets cards

[`src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx`](../../src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx) renders the "Explore other toolsets" strip beneath toolset / evergreen promo pages. Each card has a **brand wordmark on top** (`POWERSET_BRAND_TEXT[slug]` → `/images/brands/name/{brand}Text.svg`) followed by the product image filling the rest of the 3:4 frame. The card keeps a brand-coloured border/shadow from [`getToolsetBadgeStyle`](../../src/utils/package-colors/packageColorScheme.ts); no text label is rendered visually — the SR-only announcement comes from the button's `aria-label` driven by `POWERSET_LABELS` (e.g. `"RYOBI 19PC KIT AND LINK STORAGE"`).

**Layout — 4-up endless loop (2026-06-27).** `ALL_TOOLSETS` now includes **`hikoki`** (5 toolsets), so a toolset page consistently shows the **4 other** brands (HiKOKI previously couldn't appear, and non-HiKOKI pages only had 3 others). The strip is a single embla carousel at every breakpoint: the viewport now has **`overflow-hidden`** (it was missing, so the track spilled across the page — the bug behind the visible duplicate cards), and the slides are rendered **once** — the old **manual ×2 duplication was removed**. Embla's own `loop: true` provides the seamless endless wrap (clones sit at the boundary, so the visible row never shows adjacent repeats). Slides are sized `basis-[62%] sm:[42%] md:[30%] lg:[23%]`, so **desktop shows 4 full cards + a sliver of the next** — the sliver keeps the track overflowing the viewport so the loop and prev/next arrows always engage. The old `needsCarousel` static-flex-wrap branch and its resize measurement (`SLIDE_WIDTH`/`SLIDE_GAP`) were dropped.

**`POWERSET_LABELS` carry the descriptive kit + storage system** ([`prize-selection/constants.ts`](../../src/components/sections/promo/prize-selection/constants.ts)). Each label spells out its brand storage — `MILWAUKEE 13PC KIT AND 8PC PACKOUT SYSTEM`, `DEWALT 14PC KIT AND TOUGHSYSTEM STORAGE`, `MAKITA 15PC KIT AND 7PC MAKTRAK SYSTEM`, `RYOBI 19PC KIT AND LINK STORAGE` — so every consumer (`PowerToolsetCarousel`, `StaticToolsetHighlight`, `OtherToolsetsCarousel`) renders `"{kit} AND {storage} + $5000 CASH"` from one source (the `+ $5000 CASH` suffix is component-added). The PrizeShowcase/MajorDrawSection picker heading reads **"Pick your Power Toolset / Storage System"** to match.

**`TOOLBOX_LABELS`** (same file) were renamed to descriptive all-caps names — `MONSTER MILWAUKEE TOOLBOX`, `470 PIECE KINCROME TOOLBOX`, `356 PIECE SIDCHROME TOOLBOX` — rendered by [`ToolboxSelector`](../../src/components/sections/promo/prize-selection/ToolboxSelector.tsx); the equivalent inline toggle in `MajorDrawSection` was updated to the same strings. (The two-line combo-summary labels and the `prizes.ts` prize `label`/`heroHeading` strings still say "Milwaukee Toolbox" etc. — a different surface, left unchanged.)

**PromoHero — landing hero video (2026-06-12):** [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) now overlays a muted hero **video** on the landing image for brand slugs. It **plays through once (no loop)** and holds on its last frame — a new clip only plays when the slug changes (the `key` remounts it). The `.webp` hero stays the **LCP element and `poster`/fallback**; [`LandingHeroVideo`](../../src/components/sections/promo/LandingHeroVideo.tsx) fades in over it (`onPlaying` → opacity) once playback starts. Paths come from [`getLandingHeroVideoPaths`](../../src/utils/promo/landing-video-resolver.ts) (`null` for `cash-prize` / evergreen → image only). Gating — the video mounts **only** when all hold: client-mounted (`isMounted`, avoids SSR/hydration mismatch and guarantees autoplay), not `imageError`, **not** `flags.saveData`, **not** `flags.reducedMotion` (both from [`useDeviceProfile`](../../src/hooks/useDeviceProfile.ts)), and no per-slug A/B image override is pinned. Only the **active viewport's** clip mounts (`useMediaQuery("(min-width: 1024px)")` → desktop `2560×1044` vs mobile `1080×1164`), so it never double-loads. `<video>` is `autoPlay muted loop playsInline preload="auto"` with `<source>` WebM→MP4; same-origin under CSP `media-src 'self'`.

**PrizeShowcase gallery — landing hero injection (2026-06-12):** [`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) normally prepends the active slug's landing hero (`getLandingHeroImagePaths` / A/B `variantHeroOverride`) as the carousel's first slide (`enhancedGallery`, flagged `isLandingImage`). On **`/promotions/*`** this injection is now skipped (gated by `isPromotionsPage`) because `PromoHero` already renders that same hero directly above the showcase, so repeating it as slide 1 was redundant. Evergreen hosts that have no hero above — the homepage `/` and `/my-account` — still get the landing image injected.

## Modals

### PrizeSpecificationsModal

[`src/components/modals/PrizeSpecificationsModal/`](../../src/components/modals/PrizeSpecificationsModal/) shows the full spec breakdown for a prize (`prize?: PrizeCatalogEntry`). Built on `ModalContainer` (`size="4xl"`).

**Responsive layout (2026-06-02):**
- **Mobile (`<lg`)** — stacked: `Hero` landscape banner on top (wrapped in `lg:hidden`), then the scrollable specs below.
- **Desktop (`lg+`)** — two columns inside a `flex lg:flex-row` body: [`FeaturePanel`](../../src/components/modals/PrizeSpecificationsModal/FeaturePanel.tsx) on the left (`lg:w-[38%]`, sticky-feeling, non-scrolling) and the specs (`TabBar` + `SpecCard` list) scrolling on the right via `ModalContent`. The top `Hero` is hidden at `lg`.

**`FeaturePanel`** resolves the **portrait (mobile) landing image** (`getImageForMode(paths, "dark", "mobile")`, falling back to `gallery[0].mobileSrc ?? .src`) because the narrow/tall left column would letterbox the landscape desktop hero. Renders eyebrow + image + `heroHeading` + `summary` on a dark gradient. The dollar `prizeValueLabel` badge is **deliberately not shown** here (2026-06-02) — surfacing the prize's cash value was judged to risk putting entrants off. `prizeValueLabel` data is kept for the admin `MajorDrawManagement` surface.

**Per-tool photos** — `SpecCard` renders `item.image` (a `PrizeMedia`) as a `w-16 sm:w-24` `object-contain` thumbnail in the card header, replacing the generic `Package` icon when present. Photos are wired in [`prizes.ts`](../../src/config/prizes.ts) (see config-and-data domain) — items with no matched photo keep the icon. Storage sections lead with the composite system photo on the primary (rolling-base) piece (Makita MAKTRAK, Ryobi LINK); Milwaukee PACKOUT / DeWalt ToughSystem have no storage photo on disk yet.

**Tabs** — `TabBar` is horizontally scrollable at every viewport (`overflow-x-auto`). It carries `lg:pr-14` so that in the desktop 2-col layout the absolute modal close button (top-right) never sits over the last tab; the user can scroll the strip to reach every section.

**Scroll-finder footgun:** `ModalContainer.findScrollableElement` matches the first descendant whose class string *contains* `overflow-y-auto`. The `FeaturePanel` therefore uses `lg:overflow-auto` (not `lg:overflow-y-auto`) so the boundary-overscroll handler still binds to the specs `ModalContent`, not the panel — otherwise on mobile (panel `display:none`/`overflow:visible`) the finder falls through to the overflow-hidden panel and `preventDefault`s all touch scrolling.

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
- **`TrustBar.tsx`** — footer trust cells (SSL secure / NTP/17192 — sourced from `NTP_NUMBER` in `src/constants/legal.ts` / Cancel anytime)
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
| [WinnerSelectionModal/](../../src/components/modals/WinnerSelectionModal/) | 452 | 6 | `npm run test:winner-selection` (6 combos) |
| [AdminMajorDrawModal/](../../src/components/modals/AdminMajorDrawModal/) | 731 | 6 | `npm run test:admin-major-draw` (4 combos) |
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

**Updated 2026-05-04**: bumped `ToolboxSelector` unselected text to full white for legibility across brand themes; switched `LatestWinnerHero` CTA arrow to inherit `currentColor` so it stays visible in dark mode for light-primary brands.

## Overlays

### FullscreenImageViewer

[src/components/ui/FullscreenImageViewer.tsx](../../src/components/ui/FullscreenImageViewer.tsx)

Fullpage modal for browsing a gallery of winner / prize / draw photos. Used by `MembershipModal`, `WinnerStrip`, `MiniDrawImageGallery`, `PrizeShowcase`, and the dev modals gallery.

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
