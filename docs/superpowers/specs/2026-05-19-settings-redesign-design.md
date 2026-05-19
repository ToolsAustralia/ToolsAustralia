# Settings Redesign — Design Spec

_Date: 2026-05-19 · Domain: `dashboard-account` · Scope: **frontend only, no backend behavior change**_

## 1. Purpose

Port the Claude Design "Settings Redesign" handoff into the real
`My Account → Settings` page. The redesign is a cleaner, conversion-aware,
status-aware visual treatment of the settings index plus four tabs (Profile,
Subscription, Password, Payment Methods) with full light/dark support and real
mobile responsiveness.

This is a **re-skin grounded in real data and existing behavior**. No API,
service, hook, model, or business-logic change. No new data dependencies.

## 2. Source of truth

- Design bundle: `Settings Redesign.html` + `settings/{app,shell,primitives,icons,profile-tab,subscription-tab,password-tab,payment-tab}.jsx` (extracted to `c:\tmp\design_extract\tools-australia\`).
- Design intent: chat transcript `chats/chat6.md` (the user iterated: removed cover/avatar/connected-accounts, removed billing history, removed sessions/activity, SMS = "Coming soon", fixed mobile responsiveness).

### 2a. What in the design is harness, not product

The design is a prototype rendered inside a fake device frame. The following are
**design-tool scaffolding and are NOT ported**:

- The outer `App` viewport frame, `mobile-shell`, `mobile-frame`, `frame-scroll`, `.ph-stripes`.
- The entire `.mobile-frame .sm\:*` / `.lg\:*` CSS override block (≈70 rules). The real Next.js app derives `sm:`/`lg:` from the **real browser viewport**, so Tailwind responsive utilities work natively — no container-scoped override needed.
- The `TweaksPanel` / floating "Tweaks" button / `window.SETTINGS_TWEAK_DEFAULTS` (theme/viewport/userState/tab switcher) — these are a preview harness. Real state comes from real session/membership data and the real `ThemeContext`.
- The standalone `TopHeader` shell. The real app already has a shared `DashboardHeader` (back button, title, theme toggle, renewal alert) used across all `my-account` pages. We **keep `DashboardHeader`** and redesign the settings **body** only. Forking shared chrome would change other my-account pages — out of scope and a regression risk.

## 3. Scope decisions (locked)

| Area | Decision |
|---|---|
| Subscription & Payment tabs | They are thin wrappers around business-logic-heavy shared components (`SubscriptionManagementModal` ~1008 LOC, `PaymentMethodsTab` ~441 LOC, also used as modals elsewhere). **Light chrome alignment only** (spacing/section-frame consistency with the new shell). The deep pixel redesign of their internals is **flagged as a documented follow-up**, not done now. |
| Tab navigation | **Add `?tab=` URL sync** on tab change so deep links + browser back work. Pure frontend; an intentional behavior improvement over the current state-only switching. |
| Design elements with no backing data | **Render only where real data already exists; omit + flag the rest.** No fake numbers shown to real users. |
| Shared chrome (`DashboardHeader`, layout) | Unchanged. |
| Backend (APIs/services/hooks/models) | Unchanged. |

## 4. Token & primitive foundation

The codebase `tailwind.config.ts` **already defines** every color token the
design needs:

- `red.400 #ff4444`, `red.500 #ec0000`, `red.600 #ee0000`, `red.650 #e60000`, `red.675 #cc0000` — exact match to the design's `red` extension.
- `brand-tier.{tradie #00c2ed, foreman #ffd200, boss #ee0000}` — equivalent to the design's `tier.*`.
- Design's `font-display` (Poppins) → existing `font-poppins`.

Two design CSS effects are **converted to Tailwind config tokens** (matching the
existing pattern in `tailwind.config.ts`, not raw global CSS):

- `.lift` box-shadow → `boxShadow.lift` (light) + `boxShadow['lift-dark']` token; applied via `shadow-lift` / `dark:shadow-lift-dark`.
- `.pulse-ring` → `keyframes.pulseRing` + `animation['pulse-ring']` token; applied via `animate-pulse-ring`. (rgba(238,0,0,…) == red-600.)

The design's tier-gradient backgrounds (`bg-tier-*`) are only used in the
Subscription tab (flagged area); not introduced now.

### Settings UI primitives

Create **one** co-located module `src/app/(site)/my-account/components/settings/ui/primitives.tsx`
exporting the small presentational set the redesign reuses across the index + 4
tabs: `Card`, `SectionHeader`, `Field`, `SettingsInput`, `LockedField`,
`SettingsButton`, `SettingsBadge`. Rationale (CLAUDE.md "justify every new
file"): these are reused by 5+ consumers; encapsulating the design's exact
look in one file keeps the tabs free of repeated long Tailwind strings and
prevents visual drift. They are pure, typed, light+dark, no business logic.
Existing shared primitives (`Toast`, `Dropdown`, `BirthdatePicker`,
`GiveawayEligibilityNotice`) are reused as-is. Lucide icons (already a
dependency) replace the design's hand-rolled `icons.jsx`.

## 5. Component-by-component plan

### 5.1 Settings shell + index — `settings/page.tsx`

Keep `DashboardHeader`, session guard, `useMyAccountData`, `MembershipModal`
portal, `hasFailedRenewal`, sign-out logic **exactly as-is**. Redesign the body:

- **Index view** (`activeSection === null`):
  - Identity card: initials avatar, real `firstName/lastName` (`formatDisplayName`), real `email`, status badge — `Tier name` (member) / `Past due` (`hasFailedRenewal`) / `Guest` (no active subscription).
  - Past-due hero (only when `hasFailedRenewal`): red `animate-pulse-ring` card → opens Subscription tab.
  - Guest CTA (only when no active plan): dark high-contrast card → opens Subscription tab.
  - Tab preview cards (real data): Profile → "Verified"/"Not verified"; Subscription → `Tier · $price/mo · Next billing <date>` / "Payment failed — tap to resolve" / "No active plan"; Password → static label "Change your account password" (no "last changed" data → **flag**); Payment → `Visa •••• 4242 · Default` from `savedPaymentMethods`, or "No cards saved".
  - Sign-out card → existing `handleSignOut`.
- **Tab view** (`activeSection != null`):
  - Desktop: two-column `grid-cols-[260px_1fr]` — persistent vertical `SettingsSidebar` + tab content.
  - Mobile: sticky 4-col segmented tab strip + tab content.
  - URL sync: tab change pushes `?tab=<id>` (shallow), back button + deep link consistent. Index = no `?tab=`.

Status/tier derivation uses **existing helpers only** via a **pure local helper
defined inline in `settings/page.tsx`** (no new file — single consumer):
`deriveSettingsUserState(user)` → `{ state: 'member' | 'past_due' | 'guest', tierLabel?, tierPrice? }`, where:

- `past_due` ⇔ `hasFailedRenewal(user)` (takes precedence).
- `member` ⇔ `user.subscription?.isActive === true` **OR** `user.enrichedOneTimePackages?.some(p => p.isActive)` (so paying one-time customers are never labelled "Guest"). Tier label/price from `user.subscriptionPackageData` / `insights.membershipTier`; absent for one-time-only (neutral "Member" badge, no tier chip).
- `guest` ⇔ otherwise (no active subscription, no active one-time, not past-due).

This is cosmetic for the index/identity badge only; the Subscription tab still
renders the unchanged `SubscriptionManagementModal` real state machine.

### 5.2 Profile tab — `components/settings/ProfileTab.tsx` (full re-skin)

Same props, same two `update-profile` POST handlers, same query invalidation,
same `requestModal("user-setup",…)` email-verify trigger, same
`getGiveawayIneligibilityReasons` / `isGiveawayIneligible`, same `Dropdown` /
`BirthdatePicker`. Only JSX/Tailwind changes:

- Guest upsell strip (when guest) → navigates to `?tab=subscription` (same target as the index Guest CTA; reuses Phase 2 URL sync, **no new prop threaded into `ProfileTab`** — keeps its prop surface stable).
- "Personal Information": locked `IdentityCard`s (name, email) + email-verified card (real `user.isEmailVerified`; unverified shows the existing Verify-Email button).
- "Contact & Details": phone with `+61` visual prefix adornment (value handling unchanged), State, DOB (`BirthdatePicker` kept), Profession.
- Eligibility callout + `GiveawayEligibilityNotice` (existing) + Reset/Save (existing handlers).
- **Flag**: design's emoji **profession tiles** and **State button-grid** constrain a free-text/coded field and change input semantics → keep the existing `Dropdown` (state) and text `input` (profession), restyled to match; tile/grid treatment deferred. Design's plain-text DOB field → keep `BirthdatePicker`.

### 5.3 Password tab — `components/settings/PasswordTab.tsx` (full re-skin)

Same props (`userEmail`), same strength calc, same `change-password` and
`request-password-reset` handlers. Only JSX/Tailwind changes:

- Change-password form with live segmented strength bar + live **Requirements** panel (client-computed from the new-password value — real, no data dependency).
- Show/hide toggles, Clear/Update buttons (existing handlers).
- "Two-factor & recovery": SMS card = **"Coming soon"** (explicit design placeholder, disabled, flagged as not-implemented); Email-recovery card maps to the existing `request-password-reset` flow ("Send reset email").
- **Flag + omit**: the design's **Security-score dial (78)** and **security checklist** ("password set 14 days ago", "login alerts enabled") have no backing data → omitted, flagged. Email-verified status already lives on the Profile tab; not duplicated with fake context here.

### 5.4 Subscription tab — `components/settings/SubscriptionTab.tsx` (chrome only)

Wrapper continues to render `SubscriptionManagementModal … renderAsPanel`.
Only outer spacing/section-frame consistency with the new shell. **No change**
to `SubscriptionManagementModal` internals (entry math, Stripe flows,
cancellation recording, localStorage, reload). The design's
PlanHero/TierLadder/AccumulationChart/BillingCalendar/feature-matrix are
**flagged as a documented follow-up**.

### 5.5 Payment tab — `components/settings/PaymentTab.tsx` (chrome only)

Wrapper continues to render `PaymentMethodsTab`. Outer spacing/section-frame
only. **No change** to `PaymentMethodsTab` Stripe CRUD. Design's
realistic-credit-card visuals flagged as follow-up.

## 6. Flagged (deferred) design elements

A single tracking section will be added to `docs/dashboard-account/frontend.md`
(and surfaced in the final report) listing, with rationale:

1. Subscription tab deep redesign (PlanHero, TierLadder, AccumulationChart, BillingCalendar, guest feature-matrix) — wraps business-logic component.
2. Payment tab deep redesign (credit-card skins, wallet grid) — wraps Stripe CRUD component.
3. Password security-score dial + security checklist — no backing data.
4. Profile profession emoji-tiles + State button-grid — changes field semantics.
5. SMS 2FA — backend not implemented ("Coming soon" placeholder rendered).
6. Index "password last changed N days ago" preview — no backing data (generic label used).

## 7. Non-goals

- No `DashboardHeader` / `my-account/layout.tsx` changes.
- No backend, hook, service, model, or query-shape changes.
- No new npm dependency (Lucide + Tailwind already present).
- No change to `SubscriptionManagementModal` / `PaymentMethodsTab` internals.

## 8. Risks & mitigations

- **Regression in shared modal components**: mitigated by touching only the thin settings wrappers, never the modal internals.
- **Dark mode drift**: every primitive ships explicit `dark:` variants; verified against existing `.dark` class strategy.
- **Tab URL sync edge cases** (deep link, back from index): covered by deriving `activeSection` from `searchParams` as the single source of truth and pushing shallow updates.
- **Doc-sync Stop hook**: `docs/dashboard-account/` updated in the same task (final phase).
- **Type safety**: primitives fully typed; no `any`; reuse existing prop types from `MyAccountData`.

## 9. Phases (each ends in one commit, no push)

1. **Foundation** — `tailwind.config.ts` tokens (`shadow-lift`, `animate-pulse-ring`); `settings/ui/primitives.tsx` + `useSettingsUserState`.
2. **Shell & index** — `settings/page.tsx` body redesign + `SettingsSidebar` (desktop/mobile) + `?tab=` URL sync.
3. **Profile tab** — full re-skin.
4. **Password tab** — full re-skin.
5. **Sub/Pay chrome + docs + flags** — wrapper spacing alignment; update `docs/dashboard-account/`; write the flagged-elements section; final self-review pass.

## 10. Definition of done

- `npm run lint` and `npm run type-check` clean for touched files.
- All 3 user states × light/dark × mobile/desktop visually consistent with the design (minus flagged items).
- No backend/behavioral change; existing handlers/endpoints untouched.
- `docs/dashboard-account/` updated; doc-sync hook passes.
- Flagged-elements list delivered.
