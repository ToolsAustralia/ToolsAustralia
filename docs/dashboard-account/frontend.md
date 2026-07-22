# Dashboard-Account — Frontend

> **"Become a member" preselects the Tradie subscription (2026-07-07, owner decision):** matching the tier-card
> behavior ("clicking Tradie opens it with Tradie — why not Become a member too?"), every dashboard
> "Become a member" CTA now opens the MembershipModal **payment-ready with the promo-boosted Tradie
> subscription preselected** ("Change" swaps tiers): home + rewards use the new
> `useMajorDrawEntryCta.getTradieSubscriptionPlan()` (extracted from `getHeavyDutyPack`'s non-member branch —
> `getHeavyDutyPack` itself is access-dependent and returns a ONE-TIME pack for entry-holders, wrong for a
> membership CTA); the membership page routes through `cta.onSelect(tradie)` for full tier-card parity (freeze
> gate + Started Checkout tracking), falling back to the package picker until the catalog resolves. The
> rewards unlock-coupon membership branch does the same (mirrors the reference widget's
> `openMembershipModalWithTradie`). This also makes these CTAs independent of the picker-first orchestration.

> **Never bare-`openModal()` the MembershipModal (2026-07-06):** `useMembershipModal.openModal()` without a
> plan (and no prior selection) renders the **payment step with no package** — a broken skeleton view. The
> sanctioned no-plan open is **`openModalWithPackageSelectionFirst()`** (the promotions "Enter Now" path), and
> the page's `<MembershipModal>` must thread `membershipModalConfig={openWithPackageSelectionFirst ? {
> showPackageSelectionFirst: true } : undefined}`. Fixed on all dashboard surfaces: rewards `onBecomeMember` +
> the unlock-coupon membership branch, home `onBecomeMember` + the plan-less `openMembershipModal` event
> branch, and the membership page's guest CTAs (whose modal render was also missing the config pass-through).
> `getHeavyDutyPack()` is NOT a substitute default — it returns a one-time pack for entry-holders, mislabeling
> a "Become a member" tap. Landing note: `MajorDrawSection` self-defends at render
> (`selectedPlan || getHeavyDutyPack()`); `MembershipSection`'s plan-less listener branch still bare-opens
> (pre-existing, A/B-configured surface — flagged, not touched).

> **Rewards page: locked-coupon unlock routing (2026-07-06):** `my-account/rewards/page.tsx` wires
> `RewardsClaimables onUnlock={onUnlockCoupon}` — a locked purchase-required coupon opens the qualifying
> purchase flow with the code carried: `membership`-required → `membershipModal.openModal()` (membership
> packages) + `openMembershipModal` prefill event; `one-time`/`any` → `hasAdditionalAccess ?
> requestModal("special-packages", { initialCouponCode }) : openWithOneTimePlan()` (one-time packages).
> Freeze-gated. Details: [rewards-redeemables/frontend.md](../rewards-redeemables/frontend.md).

> **Mobile over-scroll fix (2026-07-03):** the dashboard **page** containers (home / rewards / membership /
> draws) no longer set `min-h-screen-svh` — only the **layout** outer div does. Previously each page forced
> `100svh` *and* the layout `<main>` adds `pb-16` (mobile) for the fixed `BottomNav`, so a short page became
> `100svh + ~96px` → a phantom ~96px scroll that made the fixed nav read as part of a scrollable page. Now
> short content fits the viewport (the outer `min-h-screen-svh` still fills the bg); tall content scrolls
> normally. Loading / empty / signed-out states keep their own `min-h-screen-svh` (they center full-height).

> **Draws countdown + cancel z-order (2026-07-03):** the **Draws** tab's `EntryWallet` drops the seconds
> cell (`showSeconds` removed) — days/hrs/mins only. And `ManageSheet`'s "Cancel membership" now **closes the
> sheet as it opens the `CancellationFlowModal`** (`closeSheet()` alongside `setCancelOpen(true)`) — the
> modal is a sibling of `SheetShell` so it survives the close; previously the Manage bottom sheet stayed
> mounted *over* the cancellation modal.

> **Scheduled downgrade in ManageSheet plan summary (2026-07-06):** the ManageSheet `renewLabel` now shows
> **"Downgrades to {tier} · {date}"** when `hasPendingDowngrade` (active member with a `previousSubscription`
> window), mirroring the Membership page's `MembershipCurrentPlan` status row so both surfaces agree. See
> [shared-ui/frontend.md](../shared-ui/frontend.md).

> **Resume membership from ManageSheet (2026-07-06):** when a member is scheduled to cancel at period end
> (`isActive && subscription.autoRenew === false` — the same state `subscription/benefits` calls `isCancelled`),
> `ManageSheet` now shows a green **"Resume membership"** button in place of "Cancel membership" (mirrors the
> `CancelResumeRow` Cancel↔Reactivate switch). It calls `useUpdateAutoRenew().mutateAsync({ autoRenew: true })`
> → `PATCH /api/stripe/update-auto-renew`, the **no-charge** inverse of the cancel path (flips Stripe
> `cancel_at_period_end` back to `false`; no proration/anchor/item mutation, no valid-payment-method
> precondition). Deliberately NOT `renewSubscription` — its `reactivate` branch runs `getValidPaymentMethod`
> first and 400s / diverts a card-less member, which is wrong for a still-paid period.

> **Cancel flow didn't close + duplicate toast (2026-07-06):** `ManageSheet`'s "Cancel membership" opens a
> `CancellationFlowModal` gated on local `cancelOpen` state (`{cancelOpen && …}` / `isOpen={cancelOpen}`). Its
> `onCancelled` handler called `onSubscriptionUpdate()` + `closeSheet()` but **not** `setCancelOpen(false)` — and
> `closeSheet()` only clears the sheet store (already null by then), so the flow modal **lingered** after a
> successful cancel. The re-enabled "cancel anyway" button then got re-clicked → a second (idempotent) cancel
> POST → the **duplicate "Subscription Cancelled" toast**. So one root cause produced both symptoms. Fix: add
> `setCancelOpen(false)` to `onCancelled` (and the twin omission on `onSaved`, which left the retention
> save-success screen lingering). A ref-latch in Step4Confirm was considered and rejected (adversarially
> verified): it wouldn't block the post-completion re-click, and `disabled={isCancelling}` already covers the
> in-flight case. The sibling `SubscriptionManagementModal` cancel path was already correct
> (`handleFlowCancelled` → `setShowCancellationFlow(false)`).

> **Incoming-entries-on-renewal note (2026-07-03, number corrected 2026-07-06):** `useDashboardState` exposes
> `renewalDateIso` (the subscription's next renewal, from `subscription.endDate` when active + `autoRenew`) and
> `membershipEntriesPerRenewal`. `EntryWallet` uses them to show the free entries that land on renewal for an
> **active member sitting at 0 membership entries** (the "subscribed but the monthly grant hasn't landed" state).
> **Number fix (2026-07-06):** `membershipEntriesPerRenewal` was `entriesPerMonth × promo` — *initial-signup*
> math that over-promised (e.g. 150 during a 5× promo) what a renewal actually grants. It now uses the CANONICAL
> `calculateRenewalEntries(activePackage.entriesPerMonth, subscription.lastMonthAccumulatedEntries).entriesToGrant`
> = **accumulated carry-forward + base, no promo** (BUSINESS.md "Carry-forward rule"; the same primitive the Stripe
> renewal webhook, the past-due settle note, the renewal-failure email, and Klaviyo use — renewals never apply
> promo). **Trialing-safe:** `endDate` is already the normalized renewal anchor for `trialing` (25-27th anchor-day)
> members, so the note reads the *renewal* date without any live Stripe `trialing` check (see docs/BILLING_ANCHOR_24.md).

> **Past-due settle-to-reactivate note (2026-07-06):** the past-due sibling of the note above. `useDashboardState`
> exposes `pastDueRenewalEntries` + `pastDueRenewalCost` (both null unless `acct === "pastdue"`), computed via
> `getPastDueRenewalPreview(iUser)` ([src/utils/subscription/past-due-renewal-preview.ts](../../src/utils/subscription/past-due-renewal-preview.ts)).
> `EntryWallet` renders an **amber** "**Settle ${cost} to reactivate · +{N} free entries land as soon as it
> clears**" note (mirrors the gold active-member note visual). Entries reuse the CANONICAL
> `getRenewalEntriesPreviewForProfile` and cost is the **same** package's `.price`, so the dashboard note, the
> resolve popup/sheet (`RenewalPreviewNote`), the renewal-failure email, and Klaviyo all show one number.
> Both entries + cost read `subscription.packageId` (the billed package = the failed invoice), so they never
> mismatch.

> **Past-due partner access reconcile (2026-07-06):** a past-due member holding a live one-time pack was showing
> partner access as **Paused / 0%**. The `/api/users/[id]/my-account` route returned the **raw, un-swept**
> `partnerDiscountQueue`, and the client resolves access from `status:"active"` rows only — but a past-due
> member's eligible pack sits `queued` behind the now-defunct membership row until a sweep runs. Fix: the route
> now reconciles an in-memory CLONE (`processPartnerDiscountQueue`) before returning, the sanctioned read side of
> the reconcile-then-read rule — so the client sees the member's REAL entitlement. Side-effect-free (the canonical
> persisted sweep stays with the cron + `GET /api/partner-discount/queue`). **Entries were never affected**
> (`entries.oneTime` renders unconditionally); only the partner-access % was stale. See [auth/backend.md](../auth/backend.md).

> **Hero "Become a member" → membership page (2026-07-03):** the dashboard-home hero's "Become a member"
> button now `router.push("/my-account/membership")` (the tier list) instead of opening the membership
> modal — the other become-a-member entry points (guest panel, upsell card) still open the modal.

> **Settings completeness indicator (2026-07-03):** `ProfileTab` (the Account-settings "Personal details"
> card) shows an amber **"{N} to complete"** badge in the header, and a **per-field amber "Required" chip**
> (`FieldLabel`) next to each *specific* empty field (mobile / DOB / profession / state), computed live from
> the edited values (chips disappear as the user fills each one) — instead of a single "Add your {fields}"
> sentence. `BirthdatePicker`'s internal `label` is dropped in favour of the shared `FieldLabel`. Email
> verification keeps its own banner.

> **Partner access % bug (2026-07-03):** `useDashboardState.partnerAccessPct` (hero ring + `RewardsPartnerCard`)
> was derived from `getActivePackage()`'s pack, which for a multi-pack one-time buyer picked the wrong one
> (e.g. a 25% Apprentice pack) — while the partner-discount **queue** correctly showed the highest-% active
> pack (40% Tradie). Fixed by resolving the % through the shared, queue-aware [`resolvePartnerCatalogPlanId`](../../src/utils/partner-discounts/partner-catalog-visibility.ts)
> (the same resolver the SSO `member_level` + queue use), so every surface agrees. Active members fall back
> to the tier map only if the resolver can't resolve.
>
> **2026-07-09:** the hook's local `expiryLabel` formatter was replaced by the shared
> `formatPartnerAccessExpiryLabel` from [`partner-access-ring.ts`](../../src/utils/partner-discounts/partner-access-ring.ts)
> — the same module that mirrors this whole ring derivation server-side for the admin user-detail modal
> (`resolvePartnerAccessRing`). One source for the ring math + caption across member and admin surfaces.

> <a id="partner-access-for-past-due"></a>**Partner access for past-due members (2026-07-03):**
> `partnerAccessPct` / `partnerAccessExpiryLabel` were only computed for `acct === "active" | "onetime"`,
> so a **past-due member who still holds a live one-time pack** got `0`/`null` — because the account-state
> precedence is `pastdue > onetime`, a past-due-with-pack user resolves to `acct === "pastdue"`. That made
> `RewardsPartnerCard` read "Paused / 0%" even though the pack window is real (independent of subscription
> status; honored by the queue, SSO, and the shop) and `RewardsPartnerQueue` right below showed it "· 25%
> active". Fixed with an `else if (acct === "pastdue")` branch: read [`getPartnerDiscountAccessInfo`](../../src/utils/membership/benefit-resolution.ts)
> and, when `hasAccess && source !== "membership"` (the guard rejects a stale-active *membership* queue row,
> a paused benefit), resolve the % via `resolvePartnerCatalogPlanId` + set the expiry label. The card then
> shows real access — see [shared-ui/frontend.md § Past-due keeps live one-time pack access](../shared-ui/frontend.md#past-due-keeps-live-one-time-pack-access-2026-07-03).
> **Server-side activation is already handled**: the daily cron `GET /api/cron/process-partner-discount-queues`
> (`vercel.json` `0 15 * * *`, v2.0.0 does its work in GET) sweeps every queue and activates due packs
> without needing a member visit — the earlier "only advances when the rewards page is opened" bug was the
> GET-was-a-no-op issue already fixed in that route.

> **Past-due tier switch on the membership page (2026-07-03):** [`membership/page.tsx`](../../src/app/(site)/my-account/membership/page.tsx) now passes `isPastDue`/`currentTierKey`/`onResolvePayment`/`onSwitchTier` to `MembershipTierList` and renders `PastDueTierSwitchModal` when a past-due member taps a *different* tier. `onPastDueSwitched` **awaits** invalidation of `queryKeys.users.account`/`.dashboard` before opening the subscribe `MembershipModal`, so the fresh-subscribe flow reads the now-`canceled` state rather than stale `past_due`. Tapping the *current* past-due tier opens the payment sheet instead. The money path (cancel + void → resubscribe) lives in [subscription/gotchas.md § Past-due tier switch](../subscription/gotchas.md#money-path); business rules in BUSINESS.md §10i.

> **One-time section shows member (Additional) packs (2026-07-03):** the dashboard membership page now calls `useMembershipCardCta({ includeAdditionalForMembers: true })` (was the default `false`). The dashboard is the member's own account, so its one-time section shows the member's **discounted `additional-*` packs** (subscription OR current-draw entries → additional-package access), matching the shared `MembershipSection` offer (the promo packages-design A/B test concluded 2026-07-06 — control won, so there is no control/treatment split anymore; the flag now exists for this page) — not the public one-time ladder (`vip-pack $1000` etc.). Without the flag `selectOneTimeDrawerPackages` always returned public packs, so members saw undiscounted prices and the coupon badge (`getAdditionalPackDiscount`, which only matches `additional-*` ids) never appeared. The public `/membership` page keeps the default (`false`) on purpose — that marketing surface shows the public ladder.

> **Subscription-explainer tier mismatch (2026-07-04):** the `subscription-explainer` modal trigger (`page.tsx`) derived `selectedPackageId` from the raw `subscription.packageId` (the *billed* tier) while `packageName`/`entriesPerMonth` came from the *effective* `activePackage.packageData` — during a downgrade-preservation window these disagree, so a Foreman member saw a Tradie chart + 50% partner offers. Now `selectedPackageId = derivePlanIdFromPackage(pkg, "subscription")` (same effective `pkg`), keeping tier + entries + % + chart consistent. See [shared-ui/frontend.md § Partner-% tier-mismatch](../shared-ui/frontend.md).

> **subscriptionTier* completeness (2026-07-04):** the `subscriptionTierKey/Hex/Label` fix (below) must be used on **every** surface that shows the tier for a past-due member. Also applied to: `ManageSheet` plan summary (`dash.tierKey/Hex` were null → generic Package icon + neutral colour beside the real name) and the Settings identity `Monogram` (`dash.tierHex` null → red avatar while the hero avatar was tier-coloured). Surfaces that branch to amber/grey for past-due (PartnerPreview, EntryWallet, RewardsPartnerCard) don't need it — they never read `tierHex` in the past-due branch.

> **Flow-verification fixes (2026-07-04):**
> - **Past-due tier identity in hero + current-plan card** — `DashboardHero` and `MembershipCurrentPlan` were fed `dash.tierKey/tierHex/tierLabel`, which are null for a past-due member (`getActivePackage` gates on `isActive`), so the home hero read "Plan · past due" and the current-plan card read "Membership · 0 entries · 0%" while the tier list on the *same page* showed "Boss · 100%". `useDashboardState` now also exposes `subscriptionTierHex`; the hero + current-plan card take `dash.subscriptionTierKey/Hex/Label`, and `MembershipCurrentPlan` reads entries from the persisted `subscriptionPackageData` for active/past-due (not `getActivePackage`).
> - **Soft-cancel renewal copy** — `MembershipCurrentPlan` gated the "Renews {date} / Auto-renews monthly" row on `autoRenew`: a canceled-but-active member (autoRenew off) now reads "Ends {date} / Cancels at period end", matching the EntryWallet/hero gating.
> - **Redeem count consistency** — `RewardsClaimables` now uses the same `{ status: "claimable", limit: 20 }` query as the home "Redeem" tile (was limit 10), so the two counts can't diverge for a >10-claimable user.
> - **Past-due tier switch freeze gate + recovered UX** — the switch tap is wrapped in `whenGatesOpenElseGateModal` (matching the server gate); the recovered-race hands off to `onPastDueRecovered` (invalidate `users.detail` + close). See [subscription/gotchas.md § Freeze-gate](../subscription/gotchas.md#money-path).

> **Code-review fixes (2026-07-04):**
> - **Past-due current tier was never marked** — the tier list was fed `currentTierKey={dash.tierKey}`, but `dash.tierKey` comes from `getActivePackage`, which returns null for a past-due (inactive) member — so no tier showed "Current · Past due" and tapping the member's own tier ran the destructive cancel+void teardown instead of resolve-payment. `useDashboardState` now also exposes `subscriptionTierKey`/`subscriptionTierLabel`, derived from the **persisted** `subscriptionPackageData.name` (survives past-due, and isn't confused by a held one-time pack). The membership page passes `currentTierKey={dash.subscriptionTierKey}` + `currentTierLabel={dash.subscriptionTierLabel}`.
> - **onPastDueSwitched cache refresh** — was invalidating only `users.account` + `users.dashboard`, which don't prefix-match the `users.detail` (`["users", id]`) query that `UserContext` + the subscribe modal read, so the modal kept reading stale `past_due`. Now invalidates `queryKeys.users.detail(userId)` (prefix-matches all three).
> - **`dashboard-state-theme` past-due accent** — `pastdue.accent` now references the shared `PAST_DUE_AMBER` from `tier-visuals` instead of a re-hardcoded `#d97706` (single source of truth for the amber).

> **User-flow audit fixes (2026-07-03):**
> - **Home "Packages" quick-tile** (`page.tsx` `QuickActionsGrid`) — `onGetPackage` was `hasAccessToAdditionalPackages ? onGetPackage : onBecomeMember`, mis-sending a past-due member (no current-draw entries) into a subscribe intent that 409s (`EXISTING_SUBSCRIPTION`). Now `onGetPackage={onGetPackage}` unconditionally — `openEntryFlow` already routes every state (additional-access → packs modal; blocking-sub/past-due → pre-selects a one-time pack; non-member → Tradie sub). Removed the now-unused `hasAccessToAdditionalPackages`/`majorDrawStats` data bindings.
> - **Settings identity badge** (`settings/page.tsx`) — a one-time buyer (`dash.acct === "onetime"`) fell through to "Guest"; now shows a **"One-time"** `info` badge before the Guest fallback, matching `DashboardHero`/`MembershipCurrentPlan`.
> - **`RewardsClaimables`** no longer takes an `acct` prop (the past-due gate moved server-side to `isRedeemableNow`) — `rewards/page.tsx` drops `acct={dash.acct}`. See [shared-ui/frontend.md § User-flow audit fixes](../shared-ui/frontend.md).

> **Loader (2026-07-03):** every `my-account/*` page's loading state (home, draws, membership,
> settings, benefits) now returns the shared [`DashboardLoader`](../../src/components/loading/DashboardLoader.tsx)
> — the Claude Design "Dashboard Loader" (ratchet-driving-a-hex-bolt medallion, theme-adaptive) —
> instead of a bare red-arc spinner. Home + draws cycle the brand status messages; the rest pass a
> static label. See [shared-ui/frontend.md § DashboardLoader](../shared-ui/frontend.md#dashboardloader-ported-from-claude-design-2026-07-03).

> **Partner discount queue on the Rewards tab (2026-07-03):** the Rewards page (`benefits/page.tsx`) now
> renders [`RewardsPartnerQueue`](../../src/components/sections/rewards/RewardsPartnerQueue.tsx) (after the
> partner card, non-guest only) — active pack + catalogue-% ring + live countdown, an own-scrolling
> "up next" list ranked by %, and the total queued access window. See
> [shared-ui/frontend.md § RewardsPartnerQueue](../shared-ui/frontend.md#rewardspartnerqueue--partner-discount-queue-2026-07-03).

> **One-time messaging (2026-07-03):** the `onetime`-state dashboard-home upsell card leads with the
> partner-discount value, then entries + bonus offers: "**Keep your partner discounts** / Membership keeps
> partner discounts on your account for good, adds more free entries every month, and unlocks member-only
> bonus offers." (Earlier drafts — "Make it permanent" and "More free entries for your money / Dollar for
> dollar…" — read as AI-generated and led with entries; reworded so one-time buyers don't read it as *their*
> one-off entries becoming permanent and so partner-discount access is the lead benefit.) Relatedly, [`MembershipCurrentPlan`](../../src/components/sections/account-membership/MembershipCurrentPlan.tsx)
> no longer shows "Renews {date} · Auto-renews monthly" + a Manage-subscription action for a **one-time**
> pack (a one-time pack has no subscription — that was a real UI bug) — that slot now shows a
> non-clickable "Become a member · Unlock exclusive rewards & free entries" advert (the join path is the
> "Choose a membership" list below).

> **Rewards portal + streak gating (2026-07-03):** the dashboard home passes `onRewardPortal` only when
> [`partnerDiscountSsoEnabled()`](../../src/config/featureFlags.ts) is on (default off until partner-portal SSO
> ships) — so the hero "Reward portal" button doesn't render meanwhile. The home `LoyaltyStreak` card is
> gated on `isDashboardFeatureOn("loyaltyStreak")` (`DASHBOARD_FEATURES.loyaltyStreak: false`) — hidden as
> **coming soon** until the 6-month milestone-reward figures are confirmed and it's re-flagged.

> **Route rename `benefits` → `rewards` (2026-07-03):** the dashboard Rewards tab moved from
> `/my-account/benefits` to **`/my-account/rewards`** so the URL matches its "Rewards" label (the folder
> is now `src/app/(site)/my-account/rewards/`). A **307 redirect** (`next.config.ts` `redirects()`) keeps
> the old path working; all internal links were repointed (`BottomNav`, `Header` ×2, `DashboardGuestPanel`,
> `PartnerPreview`, `QuickActionsGrid` ×3). Nav active-state is generic (`isNavItemActive` matches
> `item.href`), so it followed automatically. **Older doc references to `benefits/page.tsx` mean
> `rewards/page.tsx`.**

> **Foreman hero/header theme + page-header chrome (2026-07-03):** [`getDashboardStateTheme`](../../src/utils/dashboard/dashboard-state-theme.ts)
> now special-cases the **gold tier** (Foreman `#ffd200` — the only tier `inkOn` renders with dark ink):
> the generic `shade()` gradient darkened pure yellow to a **dusty olive** (`#947a00`), which is the only
> thing that looked "dirty". It's replaced with a **bright, vibrant gold** true to the Foreman membership
> colour, dipping to a warm **amber** (not olive) for depth. **Dark ink is kept** — it's the natural,
> high-contrast pairing on bright gold (white can't read on it), and the hero's dark decor/radial adds
> the metallic depth. (An earlier deep-gold + white-ink attempt drifted too dark / off-colour and was
> reverted.) [`DashboardPageHeader`](../../src/app/(site)/my-account/components/DashboardPageHeader.tsx):
> the **back chevron was dropped on tab-level pages** (Rewards/`benefits`, `membership` no longer pass
> `showBack`) — it's only for pages nested under a tab (Settings, opened from the dashboard gear, keeps
> it); and the `sub` eyebrow is now `whitespace-nowrap` with responsive tracking/size so it never wraps
> to two rows on any device.

## Pages

`src/app/(site)/my-account/`:
- Profile view / edit
- Subscription management (cancel, upgrade, downgrade)
- Payment methods (list, add, set default, remove)
- Draws history / current entries — the draws tab ([src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx)) renders the shared, page-portable `WinnersTestimony` "Hear from our winners" section (draws domain — see [docs/draws/frontend.md](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section-2026-06-11)), replacing the removed `WinnerTestimonySection`.
- Rewards / redeemables wallet
- Metrics / activity

### ProfileTab re-skin (Task 3, 2026-05-19)

`src/app/(site)/my-account/components/settings/ProfileTab.tsx` was re-skinned to the redesigned
look using Task-1 primitives (`Card`, `SectionHeader`, `Field`, `SettingsInput`, `SettingsButton`,
`SettingsBadge` from `./ui/primitives`). Behavior (handlers, fetches, toasts, modal trigger,
`Dropdown`/`BirthdatePicker`/`GiveawayEligibilityNotice`) is unchanged.

Key structural changes:
- **Props**: `ProfileTabProps.user` extended with optional `subscription?: { isActive: boolean }`
  and `enrichedOneTimePackages?: Array<{ isActive: boolean }>` (additive only; no call-site change
  needed — `page.tsx` passes the full `UserData` object).
- **Guest upsell strip**: dark-gradient `Card` shown only when `!subscription.isActive &&
  !enrichedOneTimePackages.some(p => p.isActive)`. "Join a plan" button uses `useRouter` to push
  `?tab=subscription`.
- **Identity cards**: two `Card`-based locked cards (Full name + Email) with `Lock` icon +
  "Contact support to change" microcopy; rendered in `grid sm:grid-cols-2` within a `<section>`.
- **Email verification row**: `ShieldCheck` icon card spanning 2 columns; `SettingsBadge
  tone="success" icon={CheckCircle2}` when verified, `SettingsBadge tone="warning"` + `SettingsButton`
  (calls `requestModal`) when not.
- **Phone field**: static `🇦🇺 +61` prefix adornment via `absolute` div + `SettingsInput` with
  `pl-[5.5rem]`; save/reset via `SettingsButton`.
- **Positive eligibility callout**: emerald card shown when `!isGiveawayIneligible(...)` AND the
  user has already filled in both state and birthdate (`!!state && !!(birthdate || user.birthdate)`),
  preventing premature display on blank profiles.
- **Profession**: stays free-text `SettingsInput` (emoji tiles intentionally deferred).
- No sign-out section (index + sidebar already provide it).

### ProfileTab code-review fixes (2026-05-19)

Three targeted fixes applied to `ProfileTab.tsx` without changing props, handlers, or other files:

1. **Past-due guest-strip bug**: `isGuest` now excludes past-due members by importing
   `hasFailedRenewal` from `@/utils/subscription/subscription-helpers` and computing
   `const hasFailed = hasFailedRenewal(user as unknown as IUser)`. Guard is
   `!hasFailed && !subscription?.isActive && !enrichedOneTimePackages?.some(p => p.isActive)`,
   mirroring the `deriveSettingsUserState` precedence in `settings/page.tsx`.

2. **Premature eligibility banner**: positive "You're eligible to win" callout now only renders
   when `!isIneligible && !!state && !!(birthdate || user.birthdate)`.

3. **Decorative Lock icons labelled**: both `Lock` icon instances in the Full name and Email
   identity cards now carry `aria-hidden` since the surrounding label text already communicates
   the locked state.

### Settings page (`settings/page.tsx`) — redesign 2026-05-19

The settings page was redesigned with a status-aware index and `?tab=` URL sync:

- **`SettingsSection` type** and **`SETTINGS_TABS`** constant are owned by
  `src/app/(site)/my-account/components/settings/SettingsSidebar.tsx` and re-exported from there.
- **`?tab=` URL sync**: `activeSection` is derived from `searchParams.get("tab")` as single
  source of truth. `setActiveTab(id)` pushes `?tab=<id>`; back from tab → index push; back from
  index → `router.back()`.
- **`deriveSettingsUserState`**: pure inline function mapping `user + hasFailed + membershipTier`
  to `{ state: "member"|"past_due"|"guest", tierLabel?, tierPrice? }`.
- **Index view**: identity card (initials, email, `SettingsBadge`), past-due hero (only when
  `hasFailed`), guest CTA (only when `state==="guest"`), 2-col tab preview cards with real
  summaries, sign-out card, member-since footer.
- **Tab view**: desktop `grid grid-cols-[260px_1fr]` with `SettingsSidebar`; mobile sticky
  segmented strip via `lg:hidden` / `hidden lg:block` — CSS-only, no JS viewport detection.
- All hooks, handlers, and tab component props are preserved unchanged.

### Settings Redesign (2026-05-19)

All work is contained in `src/app/(site)/my-account/components/settings/`.

#### New shared primitives — `ui/primitives.tsx`

Presentational-only components (`Card`, `SectionHeader`, `Field`, `SettingsInput`, `LockedField`,
`SettingsButton`, `SettingsBadge`). Built with `cn()` + Tailwind; support light and dark modes.
No business logic, no fetches.

#### New `SettingsSidebar.tsx`

Exports `SettingsSection` (type), `SETTINGS_TABS` (ordered array of tab definitions), and
`VALID_TAB_IDS` (string union for URL-param validation). Renders a desktop vertical nav rail and a
mobile 4-column button strip (`lg:hidden` / `hidden lg:block` — CSS-only, no JS viewport state).

#### Tailwind tokens added to `tailwind.config.ts`

- `shadow-lift` / `shadow-lift-dark` — card elevation shadows keyed to light/dark.
- `animate-pulse-ring` — subtle ring pulse used on status badges.

#### `settings/page.tsx` — status-aware redesigned index

- **`deriveSettingsUserState`**: pure inline function → `{ state: "member"|"past_due"|"guest", tierLabel?, tierPrice? }`.
- **Index view**: identity card (initials, email, `SettingsBadge`), past-due hero (only when `hasFailed`), guest CTA (only when `state==="guest"`), 2-col preview cards with real summaries, sign-out card, member-since footer.
- **`?tab=` URL sync**: `searchParams.get("tab")` is the single source of truth for `activeSection`. Navigation uses `router.push(?tab=<id>, { scroll: false })`. Browser back returns to index correctly. Deep links work.
- **Responsive layout**: `grid grid-cols-[260px_1fr]` on desktop with `SettingsSidebar`; mobile sticky segmented strip via CSS class toggling (`hidden lg:block` / `lg:hidden`).

#### `ProfileTab.tsx` — re-skin (behavior preserved)

Uses all primitives. Props extended additive-only with optional `subscription` + `enrichedOneTimePackages`.
Guest upsell strip excluded for past-due users (`hasFailedRenewal` check). Positive eligibility
callout only shown when state and birthdate are both filled. Decorative `Lock` icons carry `aria-hidden`.
No sign-out section (index + sidebar already provide it). Profession stays free-text (emoji tiles deferred).

#### `PasswordTab.tsx` — re-skin (behavior preserved)

Full `primitives`-based re-skin. Password security-score dial and security checklist omitted (no backing data).
`htmlFor`/`id` a11y wiring applied to all password fields.

> **Set-password mode (2026-05-19) — re-applied after a branch reset wiped it once.**
> `PasswordTab` takes `hasPassword?: boolean` (passed by `settings/page.tsx` as
> `hasPassword={user.hasPassword}`, sourced from `GET /api/users/[id]`). A derived
> `isPasswordless = hasPassword === false` (undefined → treated as has-password, the safe default)
> switches the tab to **set-password mode** for OAuth / passwordless accounts:
> the "Current password" `Field` is hidden, header → "Set a password", button → "Set password",
> and the `POST /api/user/change-password` body omits `currentPassword`. The security-score dial
> and checklist are untouched (they only *read* `hasPassword`). Matching server behaviour:
> [auth/api.md → POST /api/user/change-password](../auth/api.md). If a passwordless user again
> sees `"Password changes not available for this account"`, both this UI branch **and** the
> route's `isFirstTimeSet` branch were reverted.

### Settings Redesign Phase 2 (2026-05-19)

Resolves the bulk of the earlier flag list. **Frontend-only; no backend/hook/service/model/endpoint change.**

**Phase A — polish:**
- Removed the index "Member since …" footer.
- Renamed the tab **Profile → "Account details"** (sidebar `label`, `shortLabel: "Account"`; tab `id` stays `profile` so `?tab=profile` deep links/`VALID_TAB_IDS` are unaffected). Disambiguates from the bottom-nav "Profile" (=/my-account).
- Added top spacing (`pt-6 sm:pt-8 lg:pt-0`) between the mobile sticky tab strip and tab content.
- **Password security score** is now implemented (`PasswordTab.tsx`) as a **pure, deterministic, frontend-only** `computeSecurityScore({hasPassword,isEmailVerified,newPasswordStrength})`: password-set 35 + email-verified 35 + new-password-strength bonus up to 30 (live via the existing `calculatePasswordStrength`), clamped to 100; label Strong/Decent/At risk. Renders a `ScoreDial` SVG gauge + a truthful checklist (password set / email verified / 2FA "Coming soon" / strong new password). `isEmailVerified`/`hasPassword` passed additively from `page.tsx` (real `UserData` fields). No server/fabricated number.

**Phase B — index payment brand:** `settings/page.tsx` now calls the existing `useSavedPaymentMethods()` and shows the default card's real `Brand •••• last4` (+ "Default"), gracefully falling back to count/loading text. No new endpoint.

**Phase C/D — Subscription & Payment tab merge (Claude design):** A new opt-in prop **`settingsRedesign?: boolean`** on `SubscriptionManagementModal` and `PaymentMethodsTab`, set **only** by the settings `SubscriptionTab.tsx` / `PaymentTab.tsx` wrappers (alongside `renderAsPanel`). When set, the panel body renders new presentational components:
- `src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx`
- `src/components/modals/PaymentMethodsTab/SettingsRedesignPayment.tsx`

Both are **presentational only** — every value/handler is passed from the unchanged orchestrator. They reuse the verified logic sub-components (`CurrentBenefitsCard`/`UpgradeList`/`DowngradeList`/`CancelResumeRow`/`PastDueAlert`/`PendingChangeBanner`/empty states for subscription; the Stripe `<Elements>`+`AddPaymentForm` add-form and delete `ConfirmationModal` stay in `PaymentMethodsTab/index.tsx`, the `stripePromise` singleton is never re-instantiated) wrapped in the Claude tier-themed plan hero / wallet credit-card design. The 5 subscription child modals and the payment confirm-modal/add-form were hoisted so they render once in **both** branches. **Modal-mode callers (`MembershipStatus`) and the `SettingsModal` panel embed never set `settingsRedesign` → byte-behavior-identical** (verified by dedicated Opus reviews of Phase C & D).

#### Flagged / deferred design elements (still NOT implemented — follow-ups)

1. **Subscription `AccumulationChart`** (6-month entry-history bars) — no real entry-history data; the codebase deliberately never fabricates entry counts. Omitted.
2. **Subscription synthetic future billing cycles** — only the real next-billing date is shown; the design's 3 projected cycles are omitted (would be synthetic).
3. **SMS 2FA** — backend not implemented; renders a "Coming soon" placeholder only.
4. **Pixel-internal re-skin of `CurrentBenefitsCard`/`UpgradeList`/`DowngradeList`** — these are logic-entangled (entry/discount math). The Phase-2 subscription view applies the Claude design at the section/hero level and **reuses these cards unchanged** to guarantee verbatim math; re-skinning their internals is a safe future follow-up, not a defect.
5. **`htmlFor`/`id` a11y wiring on Profile phone/profession `Field`s** — Password tab has full wiring; Profile is a small follow-up for full consistency.

---

## Hooks

See [architecture.md](./architecture.md#hooks) — `useDashboardEntryDisplay`, `useDashboardLandingOrchestration`.

## LandingPageTrigger

[src/app/(site)/components/LandingPageTrigger.tsx](../../src/app/(site)/components/LandingPageTrigger.tsx) — coordinates "first-time" landing page experiences. Hooks into [metrics-analytics](../metrics-analytics/) helpers (`dashboard-landing-session`, `dashboard-entry-hold`).

## State conventions

- All data via TanStack Query from feature-domain API
- No local state for things that should be global

## className conventions (2026-05-08)

Dashboard/account components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

`MajorDrawHeaderStrip` and `MajorDrawOverview` (in [src/app/(site)/my-account/components/](../../src/app/(site)/my-account/components/)) are now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) — the surrounding account dashboard does not re-render on every tick of the embedded countdown. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the pattern.

## Resubscribe carry-over sub-line on `MajorDrawOverview` (Phase 3, 2026-05-20 — REVERTED 2026-05-21)

> **Deprecated / reverted 2026-05-21 (Phase 5 of the tier-picker polish round).** The activity-tab sub-line ("Includes resubscribe + carry-over from previous membership…") was removed from [`MajorDrawOverview`](../../src/app/(site)/my-account/components/MajorDrawOverview.tsx) along with its `activationDate` prop, the `lastResubscribedAt` entry on the nested `userSubscription` prop type, and the `drawIncludesResubscribe` derivation. `src/app/(site)/my-account/page.tsx` no longer forwards `activationDate` or `lastResubscribedAt` to the component. The success-page "Welcome back!" banner (10-minute `wasRecentResubscribe` window keyed off `User.subscription.lastResubscribedAt`) remains the canonical carry-over surface for returning users — the schema field and the resubscribe write site in `/api/stripe/create-subscription-existing-user` are unchanged. Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §3.

## Empty-state nudge animations on `MajorDrawOverview` (Phase 4, 2026-05-21)

The Membership and One-time entry cards on [`MajorDrawOverview`](../../src/app/(site)/my-account/components/MajorDrawOverview.tsx) now animate when empty, inviting the user to click. Once clicked in a given tab, the nudge stops for the rest of that tab session.

### New helper — [`src/utils/dashboard-empty-card-nudge.ts`](../../src/utils/dashboard-empty-card-nudge.ts)

Tiny `sessionStorage`-backed gate. Exports:

- `type NudgeCardType = "membership" | "onetime"`
- `hasClickedNudge(cardType: NudgeCardType): boolean`
- `markNudgeClicked(cardType: NudgeCardType): void`

Storage key shape: `ta:dashboard-card-nudge-clicked:v1:<cardType>` (one key per card). Per-tab semantics fall out of `sessionStorage`: a fresh tab re-shows the nudge, a refresh within the same tab keeps the cleared state. **Fails open**: both functions are wrapped in `try { … } catch {}` and additionally guard `typeof window !== "undefined"`, so SSR and private-browsing edge cases never throw — `hasClickedNudge` returns `false` and `markNudgeClicked` no-ops. Worst case the animation always shows.

### New keyframes + utility classes in [`src/app/globals.css`](../../src/app/globals.css)

Two animations appended:

- `@keyframes ta-nudge-pulse` → `.ta-nudge-pulse` (3s `ease-in-out` infinite `box-shadow` glow tinted to the tier-red Membership card)
- `@keyframes ta-nudge-shimmer` → `.ta-nudge-shimmer` (4s `ease-in-out` infinite background-position sweep applied via `::before` overlay; container gets `position: relative; overflow: hidden;`)

Both utility classes are wrapped in `@media (prefers-reduced-motion: no-preference)`, so users with the OS-level reduced-motion preference see fully static cards — there is no JS capability check; the OS signal is the only guard.

### `MajorDrawOverview` wiring

`MajorDrawOverview.tsx` imports the helper and tracks two local React states (`membershipNudge`, `oneTimeNudge`) seeded from `hasClickedNudge` in an effect that re-runs when the corresponding empty flag flips.

- **Membership card** (previously a non-clickable `<div>` with no `onClick`): when `!hasActiveSubscription && displayMembershipEntries === 0` AND `!hasClickedNudge("membership")`, the card renders as a `<button type="button">` with the `ta-nudge-pulse` class. Clicking it calls `markNudgeClicked("membership")` and then `router.push("/my-account/settings?tab=subscription")`. Otherwise it falls back to the original `<div>` markup — no animation, no click target, byte-identical to pre-Phase-4 behaviour.
- **One-time card** (already an existing `<button>` with `onOneTimeCardClick`): when `oneTimeEntries === 0` AND `!hasClickedNudge("onetime")`, the button gains the `ta-nudge-shimmer` class and its `onClick` is extended to first call `markNudgeClicked("onetime")` and then invoke the existing `onOneTimeCardClick?.()`. The button shape, focus ring, and downstream handler are unchanged.

No new props, no new API, no service or model change — the nudge is purely a client-side presentational layer on top of the existing empty-state detection. Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §4.

## Member-badge scoping fixes (2026-05-21)

Two related fixes ensure the "Member" label is **subscription-only** — a user holding only a one-time pack is no longer surfaced as a Member.

### `settings/page.tsx` — `deriveSettingsUserState`

[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx) `deriveSettingsUserState` no longer returns `state: "member"` for one-time-pack-only holders. The fallthrough branch (when `!hasFailed` and `!user.subscription?.isActive`) now always returns `{ state: "guest" }`, regardless of any active one-time pack. Active subscribers (`user.subscription?.isActive === true`) and `past_due` users are unchanged. User-visible effect: the identity-card badge on the settings index shows "Guest" for one-time-only users instead of "Member", and the guest CTA card appears.

### `my-account/page.tsx` — Membership-badge source gating

[`my-account/page.tsx`](../../src/app/(site)/my-account/page.tsx) now scopes `membershipPackage` and `showMembershipBadge` to `activePackage.source === "subscription"`:

```ts
const membershipPackage =
  activePackage?.source === "subscription" ? activePackage.packageData : null;
const showMembershipBadge = Boolean(
  activePackage?.isActive && activePackage.source === "subscription" && membershipPackage,
);
```

Previously `getActivePackage` returned the one-time pack as the "effective" package (with `packageData` set, `source: "one-time"`) for one-time-only users, which caused the pack to render under the Membership badge slot. Now the Membership badge only shows when a real subscription is active; the separate One-time badge continues to surface owned one-time packs independently. No API or hook change.

## Settings page back-button hard-route (Phase 5, 2026-05-21)

[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx) passes an explicit `onBackClick={() => router.push("/my-account")}` to `DashboardHeader` (alongside the existing `showBackButton` flag). The chevron now always routes to `/my-account` rather than relying on browser-history previous or stepping through the settings index from a sub-tab. The previously-defined `handleBackClick` callback that routed sub-tabs back to the settings index has been removed — `?tab=` deep links still work via `searchParams`, but the back button itself is a single hard route.

This mirrors the user's intent: "clicking the back button should navigate him to /my-account, not in the previous page." Reference spec: `docs/superpowers/specs/2026-05-21-dashboard-tier-picker-polish-design.md` §6.

## Mobile-UX hardening (2026-06-09)

Small frontend-only batch; no backend/hook/service/model change.

- **BottomNav safe-area**: [`components/BottomNav.tsx`](../../src/app/(site)/my-account/components/BottomNav.tsx) `<nav>` gained `pb-[env(safe-area-inset-bottom)]` so the fixed mobile bottom nav clears the iOS home indicator (the app now sets `viewport-fit=cover` globally).
- **iOS focus-zoom guard**: the `SettingsInput` base (`inputBase` in [`settings/ui/primitives.tsx`](../../src/app/(site)/my-account/components/settings/ui/primitives.tsx)) and the local `PWInput` in [`settings/PasswordTab.tsx`](../../src/app/(site)/my-account/components/settings/PasswordTab.tsx) moved from `text-sm` → `text-base` (16px). iOS Safari auto-zooms on focus of inputs under 16px; 16px disables that. Visual-only on desktop.
- **Lazy-loaded dashboard modals**: [`page.tsx`](../../src/app/(site)/my-account/page.tsx) now wraps `ReferFriendModal`, `PastDrawsModal`, and `PackageDetailModal` in `dynamic(() => import(...), { ssr: false })`, joining the already-lazy `MembershipModal` — they stay out of the initial dashboard bundle and only mount when opened. `PackageDetailModal`'s exported types (`PackageDetailModalPackageData`, `SubscriptionAccumulationData`) are still pulled in via `import type` so the dynamic import does not drag runtime code.

## Dashboard revamp — Spec 1: Foundation shell + Home (2026-07-02)

Ports the Claude member-dashboard prototype onto the home. Spec 1 of a sequenced set
(Rewards / Draws / Membership / Settings+overlays follow). Design + plan:
`docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md`,
`docs/superpowers/plans/2026-07-02-user-dashboard-revamp-foundation-home.md`.

### Responsive shell — [`layout.tsx`](../../src/app/(site)/my-account/layout.tsx)
- `lg:` two-pane: desktop left sidebar [`DeskNav`](../../src/app/(site)/my-account/components/DeskNav.tsx) (236px, logo + nav + footer monogram/name/email + gear→Settings) + a `max-w-[1180px]` content frame; mobile keeps the bottom nav. Retains the `data-account-layout` site-chrome opt-out. Sidebar identity is fetched via cached `useMyAccountData`; tier hex derived from the active package for the footer monogram.
- **Nav model** now lives in [`BottomNav.tsx`](../../src/app/(site)/my-account/components/BottomNav.tsx) as the shared `DASHBOARD_NAV` (+ `isNavItemActive`): **Dashboard / Rewards (→`benefits`) / Draws (raised center FAB) / Membership / Support**. Settings is reached via the gear (hero + sidebar footer), not a nav slot. `DeskNav` consumes the same model.

### State hook — [`useDashboardState`](../../src/hooks/useDashboardState.ts)
Single source of home view-state. Resolves the account state via the pure
[`deriveDashboardAccountState`](../../src/utils/dashboard/derive-dashboard-account-state.ts)
(precedence **pastdue > paused > active > onetime > none**, traced against `subscription.isActive`,
`subscription.status`, `hasFailedRenewal`, `getActivePackage().source`), plus tier + [`getDashboardStateTheme`](../../src/utils/dashboard/dashboard-state-theme.ts)
(hero gradient/ink/accent), promo multiplier, entry buckets (`useDashboardEntryDisplay`),
partner access %/expiry, and streak months — all from existing cached queries. Section
components stay dumb and consume this. Pure logic is `tsx`-tested
(`test:dashboard-state-theme`, `test:dashboard-account-state`).

> **Retention-paused is a first-class state (2026-07-21):** a member in the `pause_30d`
> freeze window carries `subscription.status === "paused"` + `isActive === false`. Because
> the freeze zeroes `isActive`, it would collapse to `none` ("No membership") without an
> explicit arm — so `deriveDashboardAccountState` gains an `isPaused` input checked BEFORE
> the active/none arms, and `useDashboardState` computes `isPaused`
> (`subscription.status === "paused"`) and exposes **`pausedUntil`** (the `Date` from
> `subscription.pausedUntil`, null otherwise) so surfaces can render "Paused · resumes
> {date}". `getDashboardStateTheme("paused")` returns a calm slate-sky fixed palette
> (`FIXED.paused`). Perks stay frozen during the pause: `partnerAccessPct`, `streakMonths`,
> `renewalDateIso`, and `membershipEntriesPerRenewal` are all left at their non-member
> defaults for `acct === "paused"` (no access/accrual until resume).

### Sections — `src/components/sections/dashboard/`
`DashboardHero`, `EntryWallet` (entries hero — total/split-bar/countdown, extracted from the
`MajorDrawOverview` concept), `DashboardPromoBanner` (compact multiplier card — new file, the
marketing `PromoBanner`'s scroll-morphing layout is irreconcilable with a card), `LoyaltyStreak`,
`QuickActionsGrid`, `PartnerPreview`, `DashboardGuestPanel`. Composed by
[`page.tsx`](../../src/app/(site)/my-account/page.tsx), which **keeps all existing modal
orchestration inline verbatim** (setup/upsell/subscription-explainer/refer/past-draws/
package-detail + `openMembershipModal` listener) — visual layer only was recomposed.

### Coming-soon switches — [`src/config/dashboardFeatures.ts`](../../src/config/dashboardFeatures.ts)
`DASHBOARD_FEATURES` off-by-default map (`cobberSupport`, `milestoneProgress`, `personalWins`,
`orderHistory`). Fully-built UI mounts behind these; a future session flips one to surface it.
`LoyaltyStreak`'s milestone-unlock line and `QuickActionsGrid`'s Vouchers/Milestones tiles are gated here.

### Flagged for deletion (NOT deleted — user review pending)
Mirrored in the `page.tsx` header comment: dead `MembershipStatus.tsx`, `ActivePrizeDraws.tsx`,
`RecentOrders.tsx`, empty `EntryWallet.tsx` stub, stale `components/index.ts` re-exports;
superseded-but-kept `DashboardHeader`/`CoverBanner`/`UserInfoBar`/`QuickActions`/`SocialLinksSection`
(still used by sub-pages until their specs); `MajorDrawOverview` (wallet extracted; countdown role → Draws sub-project).

## Dashboard revamp — Spec 2: Rewards (2026-07-02)

Rebuilds the Rewards destination (`/my-account/benefits`, nav-labelled "Rewards") to
**Partners FIRST → Claimables → Milestones**, state-aware. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-rewards-design.md`.

- **[`benefits/page.tsx`](../../src/app/(site)/my-account/benefits/page.tsx)** — rewritten to a thin
  composer fed by `useDashboardState`: `DashboardPageHeader` + `RewardsPartnerCard` + (non-guest)
  `RewardsClaimables` + `RewardsMilestones`. Keeps the login redirect + `MembershipModal`. Drops the
  ad-hoc red hero (now `DashboardPageHeader`). Flagged-for-deletion (kept, shared): `PartnerDiscountQueue`, `UnlockDiscounts`.
- **[`DashboardPageHeader`](../../src/app/(site)/my-account/components/DashboardPageHeader.tsx)** —
  shared state-recolored page-header band (gradient + gold seam + title/sub + action icon + optional
  back chevron), the prototype's `PageHeader`. Reused by Rewards / Membership / Settings sub-pages;
  resolves the old fixed-`DashboardHeader`-vs-sidebar conflict.
- **Sections `src/components/sections/rewards/`**: `RewardsPartnerCard` (leads — `AccessRing` +
  `usePartnerDiscountSso` portal + `PARTNER_BRAND_OFFERS` grid; state CTAs), `RewardsClaimables`
  (`useRedeemablesWallet` claimable/past + `useRedeemableRedemption`; **paused-safe** — the rewards
  program 503 renders a neutral "temporarily unavailable" state, never a crash), `RewardsMilestones`
  (**visual milestone progress track** — real continuous-membership `months` drive the current
  position + milestone nodes at 3mo/6mo and a "N months to your next +50/+250 free entries" line;
  milestone amounts are documented constants, never fabricated. Superseded the earlier
  `milestoneProgress`-gated text teaser now that member-since `months` is a confirmed real read).

### Home + hero refinements (2026-07-02)

- **`DashboardHero`** now takes `tierKey` / `profileComplete` / `onCompleteProfile`. Active members'
  tier chip shows the real **tier package icon** (`getPackageIcon(\`${tierKey}-subscription\`)`), not a
  generic crown. The member "Reward portal" button is a **chip-sized premium gold** pill (matches the
  tier chip) and **triggers the partner-discount SSO** (`usePartnerDiscountSso().mutate()` → MyRewards
  portal via `POST /api/partner-discount/sso`), NOT a route to `/my-account/benefits`. When
  `profileComplete === false` a high-contrast
  **"Complete your profile"** nudge renders in the hero (→ reopens the `user-setup` modal via
  `requestModal`). `profileComplete` is derived in the home page as
  `Boolean(user.profileSetupCompleted && user.birthdate)` (mirrors the setup-modal trigger).
- **`RewardsFloatingWidget` removed from the home** — the sidebar/bottom-nav **Rewards** item
  (`DASHBOARD_NAV` → `/my-account/benefits`) is now the single entry point to claimable rewards;
  the `QuickActionsGrid` "Rewards" tile still shows the claimable-count badge.

### Settings → Account settings + subscription/payment overlays (2026-07-02)

The tabbed Settings destination (`?tab=account|subscription|password|payment` + `SettingsSidebar`)
was collapsed into the Claude-design IA:

- **`settings/page.tsx`** is now ONE consolidated **Account settings** page — identity card,
  `ProfileTab` (email-verify banner + personal details), an Appearance card (`ThemePicker`,
  Light/Dark only), `PasswordTab`, and Sign out. No `?tab=` routing, no sidebar.
  **`SettingsSidebar.tsx` was deleted** (fully orphaned).
- **`ProfileTab` + `PasswordTab` rebuilt to the clean Claude design** (2026-07-02): `ProfileTab` is
  now email-verify banner + Mobile / DOB / Profession (select) / State (select) with a **single
  "Save changes"** (one POST to `/api/user/update-profile`) instead of two per-section saves and the
  emoji/state tile grids; a compact giveaway-eligibility note shows only when ineligible. `PasswordTab`
  is a minimal change/set-password card + strength meter + "Email me a reset link" — the security-score
  dial, 2FA/SMS placeholder and requirements side-panel were dropped. Same endpoints
  (`/api/user/change-password`, `/api/auth/request-password-reset`). Profession/State use the styled
  `SelectMenu` dropdown (not native `<select>`); the Appearance `ThemePicker` is a segmented-pill
  toggle; the identity card shows a **tier badge** (package icon + `tierLabel`) for members instead
  of a generic "Member" chip. (System theme stays omitted — the theme store is light/dark only.)
- **Subscription + payment are overlay sheets**, not pages: `components/sheets/ManageSheet.tsx`
  (`sheet === "manage"`) and `PaymentSheet.tsx` (`sheet === "payment"`), mounted in `layout.tsx`
  next to `SupportSheet`, bottom-sheet on mobile / centered popup on desktop via `SheetShell`.
  - `PaymentSheet` reuses `PaymentTab` (PaymentMethodsTab `settingsRedesign`) — its
    `SettingsRedesignPayment` panel + `AddPaymentForm` were restyled to the clean prototype (see
    shared-ui/frontend.md). Card Stripe wiring unchanged.
  - `ManageSheet` is now a **clean custom body** (plan summary → active: "Update payment method" /
    past-due: amber "Update payment to resume" → Change tier → Cancel membership). Past-due members
    get the "Past due" badge, the amber resume button, AND the Cancel option (cancel is now gated on
    `isMember`, not `isActive`-only — a past-due member can cancel). It **delegates the money-path
    flows** rather than re-implementing them (the change-tier upgrade/downgrade Stripe wiring can't be
    safely re-implemented — zero-trial-invoice / entries-grant footguns, see docs/subscription):
    **update-payment AND past-due resume** both → `openSheet("payment")`; **cancel** → self-contained
    `CancellationFlowModal` (`onResolvePayment` → `openSheet("payment")`); **change-tier** → closes the
    sheet and routes to the **Membership page tier list** ("See all tiers below"). The **`PaymentSheet`
    renders `PastDueResolvePanel`** (sheet-native, no modal chrome) for past-due members, so the ONE
    payment sheet retries the failed invoice + resumes (declines / 3DS / add-card-then-retry /
    force-charge) as well as manages cards — the separate past-due popup is gone. The resolve state machine
    is shared with the legacy `RenewalFailedModal` via `usePastDueResolve` (see subscription/frontend.md),
    so the money path is single-sourced. `SubscriptionTab.tsx` is now orphaned (kept as the documented
    type-only-import example).
- **Tier change (2026-07-02):** on the Membership page, a member tapping a **different** tier in
  `MembershipTierList` fires `onChangeTier(plan.name)`, which mounts `SubscriptionManagementModal`
  (modal mode) with **`autoSelectPlanName`** — a new opt-in prop: once benefits load, an effect finds
  that tier in `availableUpgrades`/`availableDowngrades` (matched by name) and calls the SAME
  `setSelectedUpgrade`+`setShowUpgradeConfirm` (or downgrade) setters the in-modal click uses, so it
  jumps straight to the confirm. When `autoSelectPlanName` is set the orchestrator renders in
  **confirm-only mode** — it returns just the confirm modal (`return <>{childModals}</>`), skipping the
  redundant "Manage Subscription" chrome/body (the Membership page already shows the plan + tier list);
  closing the confirm calls `onClose`. Unmatched taps close (no stranded invisible modal). The prop is opt-in,
  so all other `SubscriptionManagementModal` callers are byte-identical. Tapping the **current** tier
  → `onManagePlan` (opens the Manage sheet).
- **Openers** (all via `useDashboardSheetStore.openSheet`): `MembershipCurrentPlan` Manage/Payment
  rows, `MembershipTierList` member tap, the hero/RewardsPartnerCard past-due "Update payment", all
  → `manage`; the payment row → `payment`. The global `Header` "Manage" (`/my-account?open=subscription`)
  is honoured by a new `?open=subscription|payment` handler on the home page that opens the sheet and
  cleans the URL. `ProfileTab`'s guest "Join a plan" now routes to `/my-account/membership`. The
  membership page passes the default-card label (`useSavedPaymentMethods`) to
  `MembershipCurrentPlan` as `paymentLabel` for its "Payment method / Visa •••• 4827 → Edit" row.
- **Sidebar sticky fix:** `overflow-x-hidden` was removed from the `my-account/layout.tsx` flex
  parent (it computed `overflow-y: auto`, becoming the sticky scroll-container and breaking
  `DeskNav`'s `sticky top-0`); the horizontal clip moved to `<main>`.
- **Support sheet form (2026-07-02):** the embedded site `ContactForm` (its own duplicate title +
  underline inputs + `MetallicButton` looked off in the sheet) was replaced by a compact
  `components/sheets/SupportContactForm.tsx` — clean bordered inputs, pill subject selector, red
  submit — same `/api/contact-submissions` POST + pixel `trackLead`. The site `/contact` `ContactForm`
  is untouched.
- **Total sign-out (2026-07-02, resolved):** the Account-settings Sign-out (and the Header /
  AdminSidebar / forced-logout paths) now call `totalSignOut()`
  ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)), which clears the
  user-scoped portion of client storage before ending the session (keeps device/attribution prefs).
  See [auth/frontend.md](../auth/frontend.md#total-sign-out-2026-07-02).

## Dashboard revamp — Spec 3: Draws (2026-07-02)

Rebuilds `/my-account/draws` to a **Major / Mini `Seg` toggle**. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-draws-design.md`.

- **[`draws/page.tsx`](../../src/app/(site)/my-account/draws/page.tsx)** — thin composer fed by
  `useDashboardState`: `DashboardPageHeader` + `Seg` → **major** (`DrawsMajorHero` → reused
  `EntryWallet` → `DashboardPromoBanner` → "Get more entries" → `DrawHowItWorks` → `DrawWinners`) or
  **mini** (`DrawsMini`). Removed from this page but kept (shared, used elsewhere):
  `PrizeShowcase`, `MembershipSection`, `LatestWinnerHero`, `WinnersTestimony`,
  `MajorDrawHeaderStrip`. _(`PrizeShowcase` is no longer "flagged for deletion" — it was rewritten
  2026-07-21 into the "Build your prize" configurator and is live on `/` and `/promotions/*`; see
  [promo/frontend.md](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21).)_
  > _Update 2026-07-02:_ `DrawsMajorHero` dropped its "Live · {draw} · Drawn 8:30 PM AEST" status row
  > (redundant with the Draws toggle bar) and its `drawName`/`drawStatus` props; the draws page
  > dropped the entries card's `-mt-[34px]` overlap (→ `pt-4`) that had covered "View this promotion"
  > with "Your entries". The **separate `DashboardPromoBanner` section was removed** from the draws
  > page — its promo energy now lives inside the `EntryWallet` "Get more entries" button (multiplier /
  > 50%-off badges), fed by `multiplier={dash.multiplier}` + `hasAdditionalAccess={dash.hasAdditionalAccess}`.
  > `DrawsMini` ranks the top 8 mini draws by fill %.

- **Sections `src/components/sections/draws/`**: `DrawsMajorHero` (prize picker setup vs $10k cash
  via `usePrizeCatalog` + `resolvePrize("cash-prize")`, live countdown, "View this promotion" →
  `/promotions`), `DrawHowItWorks` (static 3 steps), `DrawWinners` (`useMajorDrawWinners`, monogram
  fallback, state-not-suburb — replaces the old raw `fetch("/api/winners/all")`), `DrawsMini`
  (`useMiniDraws` + embedded `miniDrawParticipation`, `MiniDrawCard` grid — dead per-mini-draw entry
  hooks intentionally NOT wired).
- Reuses `EntryWallet` for the entries breakdown (DRY with the home).

## Dashboard revamp — Spec 4: Membership (2026-07-02)

Rebuilds `/my-account/membership` to current-plan + tier list + one-time packs + manage. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-membership-design.md`.

- **[`membership/page.tsx`](../../src/app/(site)/my-account/membership/page.tsx)** — thin composer:
  `DashboardPageHeader` + `MembershipCurrentPlan` + **reused `MembershipTierChooser`** (public
  `/membership` conversion section, driven by `useMembershipCardCta` — the verified upgrade/downgrade/
  current/past-due/guest CTA state machine + promo-multiplied entries) + `MembershipModal`. Replaces
  the old marketing composition.
- **[`MembershipCurrentPlan`](../../src/components/sections/account-membership/MembershipCurrentPlan.tsx)**
  — state-aware plan summary (tier gradient, stats, renew/paused/none) + Manage/Payment links to the
  Settings panels. Full cancel/change flow stays in the Settings subscription panel (no duplicate).
  The page also passes **`entriesPerRenewal={dash.membershipEntriesPerRenewal}`** so the card can show
  the "Free entries accumulate each month — {N} land on your renewal, {date}" hint (same accumulated
  renewal grant the `EntryWallet` shows) and an ⓘ that re-opens `SubscriptionExplainerModal`. The
  "Free entries / mo" stat stays the tier **base**; see [shared-ui/frontend.md](../shared-ui/frontend.md)
  "Entries framing" (2026-07-15) for the base-vs-one-time-boost distinction.
- **🚩 `MembershipPackagesChart` is now fully orphaned** (this page was its last user) — flagged for
  deletion in the page header; kept for user review.

## Dashboard revamp — Spec 5: Settings + Support (2026-07-02)

Closes the Settings gaps + finishes shell consistency. Spec:
`docs/superpowers/specs/2026-07-02-dashboard-settings-overlays-design.md`.

- **Appearance / [`ThemePicker`](../../src/app/(site)/my-account/components/settings/ThemePicker.tsx)** —
  Light/Dark segmented control (`useTheme` → `setTheme`, persists to `localStorage["ta-theme"]`),
  added as an Appearance card on the Settings index. **No System mode** (deliberately dropped).
- **[`settings/page.tsx`](../../src/app/(site)/my-account/settings/page.tsx)** — swapped the fixed
  `DashboardHeader` for `DashboardPageHeader` (state-recolored, in-flow; removes the last fixed-bar
  vs desktop-sidebar overlap); loading/error guards no longer render a header. `DashboardPageHeader`
  gained an optional `onBack` so a tab returns to the index (index → dashboard).
- **[`support/page.tsx`](../../src/app/(site)/my-account/support/page.tsx)** — rewritten to
  `DashboardPageHeader` + Ask-Cobber card + Email us + FAQ accordion + kept `ContactForm`. No
  WhatsApp/phone. Responsive sheet-shell delivery deferred (route).
- **Ask-Cobber card is LIVE (2026-07-07):** `cobberSupport` was flipped **on**, so the card in
  `SupportSheetBody` (both the Support sheet and the `/my-account/support` route) now shows "Online /
  **Start a chat**", and that button opens the Cobber support-chat panel. It calls `closeSheet()` then
  `openSupportChat()` ([widget-events.ts](../../src/lib/support-chat/widget-events.ts)) — the shared
  window event the `SupportChatWidget` listens for. On `/my-account` the floating chat bubble is
  **suppressed** so this card is the single Cobber entry point; the panel also hides while any
  Support/Payment/Manage `SheetShell` is open (z-index de-dup). See
  [ai-chatbot/merge-to-main.md § 4a/4b](../ai-chatbot/merge-to-main.md).
- **🚩 Newly orphaned → flagged for deletion:** `DashboardHeader.tsx` (Settings was its last user),
  `MajorDrawHeaderStrip.tsx` (old draws only).
- **Flagged to verify (not modified — money path):** billing-history tab inside the shared
  `SubscriptionManagementModal` / `PaymentMethodsTab` — the design removes billing history.

## Dashboard home — pixel-fidelity rework (2026-07-02)

Reworked the home to match the Claude prototype (`ConceptHub` mobile + `ConceptHubDesktop` desktop) 1:1:

- **Flush layout:** `layout.tsx` no longer centers content in a `max-w` wrapper — the content sits flush against the desktop sidebar (prototype behavior).
- **DashboardHero:** responsive — desktop is a single row (monogram + greeting + **inline** tier chip + `AccessRing` + Reward-portal, **no gear**); mobile is two rows (+ gear). Keeps our existing `AccessRing` (preferred over the prototype's).
- **EntryWallet:** desktop 2-column card (number + split bar + legend │ divider │ "Draw closes in" + `CDBox` cells); mobile stacks (countdown below a hairline). Headline total = membership + one-time (never contradicts the legend). Removed the projected/resolve extras (prototype shows the plain total + a separate ribbon).
- **DashboardAlertRibbon (new):** past-due (amber) / one-time (teal) ribbon above the wallet.
- **QuickActionsGrid + `QuickTile`:** glossy `linear-gradient(158deg,…)` chips with the prototype `CT` palette ([tile-colors.ts](../../src/utils/dashboard/tile-colors.ts)); mobile 4-col/8 tiles (adds Partners+Support), desktop 3-col/6 tiles.
- **PartnerPreview:** access ring + prototype `DealRow` (letter badge · name · **category** · offer). Added a canonical `category` to `PARTNER_BRAND_OFFERS`.
- **DashboardPromoBanner:** "50% off one-time packages" restored — it is the **real** member-only **Additional packages** benefit (50% of the one-time price; `hasAdditionalPackageAccess`). Gated on `hasAdditionalAccess`; palette escalates with the live multiplier + "Ends in HH:MM:SS" (next AEST midnight).

### Access-aware multiplier (important logic fix)
`useDashboardState` now resolves the multiplier per the canonical rule (mirrors `PromoBanner`
`effectivePromoTypeForBanner` + `getEffectivePromoType`): **active subscription → membership-packages
multiplier** (members buy Additional packs); **everyone else → one-time-packages multiplier**. It also
exposes `hasAdditionalAccess` (active sub OR current-draw entries) which gates the real "50% off"
copy. Previously it used the one-time multiplier for everyone — wrong for members.

> **Verify before launch:** the loyalty-streak "+250 free entries at 6 months" figure is the design's
> stated milestone — confirm the exact reward against the real `MilestoneReward` config.

### Dead-code removal (2026-07-02)
The pre-revamp scaffold under `my-account/components/` was **deleted** (all confirmed 0-usage after
the revamp): `DashboardHeader`, `CoverBanner`, `UserInfoBar`, `QuickActions`, `SocialLinksSection`,
`MembershipStatus`, `ActivePrizeDraws`, `RecentOrders`, `MajorDrawHeaderStrip`, `MajorDrawOverview`
(its entries logic → `sections/dashboard/EntryWallet`; hero/countdown → `sections/draws/DrawsMajorHero`),
the empty `EntryWallet.tsx` stub, and the stale `components/index.ts` barrel. `my-account/components/`
now holds only `BottomNav`, `DeskNav`, `DashboardPageHeader`, `sheets/`, and `settings/`.

### Overlay sheets (2026-07-02)
Support is now a **responsive overlay sheet** (bottom-sheet mobile / centered modal desktop), matching
the prototype — not a page. The nav "Support" item (`BottomNav` + `DeskNav`) calls
`useDashboardSheetStore.openSheet("support")` instead of routing; the layout mounts the global
`components/sheets/SupportSheet` host over any dashboard page via the shared
[`SheetShell`](../../src/components/ui/SheetShell.tsx). The `/my-account/support` route is kept for
deep links — it opens the sheet and redirects to `/my-account`. Support content lives once in
`SupportSheet` (`SupportSheetBody`). Payment/Manage remain settings panels (the store reserves
`"payment"`/`"manage"` kinds for a future sheet host); the Settings **single-page** layout is still a
follow-up.

## Membership Streak state (P3 — 2026-07-07)

- `useDashboardState.streakMonths` now reads the REAL durable counter (`user.subscription.streakMonths` — P1) for `active` **and** `pastdue` members (past-due keeps its banked count); the old `monthsBetween(startDate)` derivation is deleted (upgrades reset `startDate` — the exact bug the counter fixes). `entries` gains a `streak` bucket (from `streakEntries` on the major-draw stats payload, via `useDashboardEntryDisplay` — streak is never frozen by the pre-purchase hold since purchases can't change it).
- **[streak-display.ts](../../src/utils/dashboard/streak-display.ts)** — pure display derivations: `streakAccentVars(tierKey)` (Build Kit `--s-*` tier themes + tempered-steel default), `deriveStreakCardState` (fresh/active/atrisk/paused/founding), `deriveStreakCycleFuse(renewalDateIso)` (day-in-cycle from the real renewal date).
- **[useStreakCelebration.ts](../../src/hooks/useStreakCelebration.ts)** — once-per-rung celebration on the first dashboard visit after a milestone lands (spec §7b M1): per-user localStorage marker (`ta-streak-seen:<userId>`), seeds silently on first visit (no retro celebrations — mirrors the backfill "recognise, don't pay" policy), celebrates the newest rung crossed since last seen.
- The my-account page renders the streak card in the aside for ALL states behind `DASHBOARD_FEATURES.loyaltyStreak` (one-time holders get the teaser variant — it replaced the "Keep your partner discounts" card), passes the guest teaser into `DashboardGuestPanel`, and mounts the celebration toast.

## Streak review fixes (2026-07-15)

- `useStreakCelebration` no longer exposes `dismiss` — the toast self-manages its visibility, so `justHit` (which also drives the in-card banner + gold chip) persists for the whole session instead of dying with the toast's 8-second auto-hide. The marker also **re-seeds DOWNWARD** on a streak reset (lapse → resubscribe), otherwise a member who peaked at 8 would celebrate nothing until passing 8 again. Known accepted limitation: sign-out clears the marker (privacy rule), so a rung crossed while signed out is silently re-seeded on the next sign-in — a server-side "last celebrated" field is the structural fix (P4 candidate).
- The celebration copy names the RECEIVING draw: `streakReceivingDrawName` in `my-account/page.tsx` says "next Major Draw" when `dash.drawStatus` is `frozen`/`completed` (freeze-window grants route to the queued draw), otherwise the current draw's name.
- `/my-account/draws` passes `entries.streak` into its `EntryWallet` mount (was omitted — undercounted the total vs the home wallet).
- `deriveStreakCycleFuse` clamps month-end overflow (a 29–31st renewal minus one month, e.g. 31 Mar → "31 Feb" → 3 Mar, now clamps to the last day of the intended month).
- Both streak flags (`loyaltyStreak`, `milestoneProgress`) ship **dark** until the launch runbook completes — see `src/config/dashboardFeatures.ts`.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.
