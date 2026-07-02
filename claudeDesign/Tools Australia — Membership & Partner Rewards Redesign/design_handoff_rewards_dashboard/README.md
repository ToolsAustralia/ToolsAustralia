# Handoff: Tools Australia — Member Dashboard Redesign

## Overview
A redesign of the logged-in **member dashboard** for Tools Australia Rewards. It covers five destinations plus three overlays:

- **Dashboard** (home) — hero standing, entries wallet, promo banner, loyalty streak, quick actions
- **Rewards** — partner discounts (SSO handoff), free claimables, loyalty milestones
- **Draws** — the monthly major draw + entries-based mini draws, prize picker, how-it-works, past winners
- **Membership** — current plan, tier list, one-time packages
- **Settings** — verify email, edit contact/DOB/profession/state, appearance (theme)
- **Overlays** — Support (Cobber AI + email), Payment method, Manage membership

It is responsive: **mobile** uses a docked bottom nav; **desktop** uses a left sidebar + multi-column layout. It supports **light / dark / system** themes, **three tiers** (Tradie / Foreman / Boss), **four account states** (active member / one-time-pack holder / past due / no plan), and a **purchase-time promo multiplier** (2× / 3× / 5× / 10×).

> ⚠️ **This is the DASHBOARD.** Everything is shown at a glance here. The Rewards page is a *separate destination* — do not merge partner-discount claiming/milestones into the dashboard.

---

## About the Design Files
The files in this bundle are **design references created in HTML/React (via in-browser Babel)** — prototypes that show the intended look and behavior. **They are not production code to copy directly.**

Your task is to **recreate these designs in the existing Tools Australia codebase** (Next.js App Router + TypeScript + `.tsx`) using its established components, styling approach, data hooks, and auth/session patterns. The prototype re-implements your UI from scratch for demonstration; the real work is porting the *visual + interaction design* onto your live components and data.

The prototype deliberately mirrors your route structure so the mapping is 1:1 — see **"Mapping to your codebase"** below.

---

## Fidelity
**High-fidelity (hi-fi).** Colors, typography, spacing, radii, shadows, and interactions are final and intentional. Recreate the UI pixel-faithfully using your codebase's existing libraries/tokens. Where the prototype hardcodes a value that already exists as a token/component in your app, prefer the app's token/component.

---

## Mapping to your codebase
Your `src/app/(site)/my-account/` tree maps directly onto the prototype. Recreate the design **inside these files** rather than adding new routes:

| Design (prototype) | Your file | Notes |
|---|---|---|
| Dashboard / Home Hub | `my-account/page.tsx` | `ConceptHub` (mobile) + `ConceptHubDesktop` (desktop) |
| Hero header (greeting, tier chip, access ring, portal btn) | `components/DashboardHeader.tsx` | Header recolors to the package/tier |
| Cover background | `components/CoverBanner.tsx` | Package-colored gradient (see states) |
| Entries wallet ("Entries · June 27 draw", split bar) | `components/EntryWallet.tsx` | Currently **empty (0 bytes)** — build it here |
| Quick-action tiles (Packages, Redeem, Vouchers, Refer…) | `components/QuickActions.tsx` | Glossy icon tiles + badges |
| Bottom nav (mobile) | `components/BottomNav.tsx` | 5 items — see Nav model |
| Membership status card | `components/MembershipStatus.tsx` | Plan summary, renew/paused states |
| Draws page | `draws/page.tsx` | `DrawsPage` |
| Major draw hero + countdown | `components/MajorDrawOverview.tsx`, `MajorDrawHeaderStrip.tsx`, `ActivePrizeDraws.tsx` | Prize picker (Setup vs Cash), freeze/draw flow |
| Membership page | `membership/page.tsx` | `MembershipPage` — tier list + packages |
| Rewards / benefits | `benefits/page.tsx` | `RewardsPage` — partners FIRST, then claimables + milestones |
| Settings shell + tabs | `settings/page.tsx`, `settings/SettingsSidebar.tsx` | `SettingsPage` |
| Profile fields (email verify, mobile, DOB, profession, state) | `settings/ProfileTab.tsx` | `Field` + `TextIn`/`SelectIn` |
| Payment method (panel) | `settings/PaymentTab.tsx` (**stub, 825 b**) | `PaymentSheet` — build out here |
| Manage subscription (panel) | `settings/SubscriptionTab.tsx` (**stub, 1222 b**) | `ManageSheet` — build out here |
| Support | `support/page.tsx` | `SupportSheet` — Cobber AI + email |
| Shared form primitives | `settings/ui/primitives.tsx` | Reuse for inputs/toggles |

**Overlay pattern:** Support, Payment, and Manage are **bottom sheets on mobile, centered modals on desktop** (one responsive shell — `SheetShell` in the prototype). Your `PaymentTab`/`SubscriptionTab` are currently near-empty stubs; the prototype's `PaymentSheet`/`ManageSheet` are the intended full content, presented either as a settings tab (desktop) or a sheet (mobile) — pick whichever fits your routing, but keep the responsive sheet/modal behavior.

---

## Cross-cutting systems (read first — they touch every screen)

### 1. Tiers
Three membership tiers. Each drives an accent color, monthly free entries, and partner access %.

| id | name | price/mo | entries/mo | access | color |
|---|---|---|---|---|---|
| `tradie` | Tradie | $20 | 15 | 50% | `#00c2ed` |
| `foreman` | Foreman | $40 | 40 | 75% | `#ffd200` |
| `boss` | Boss | $80 | 100 | 100% | `#ee0000` |

### 2. Account states
The dashboard + rewards + membership pages all branch on state:

- **`active`** (member) — full hero in tier color, entries wallet, loyalty streak, partner access at tier %.
- **`onetime`** (one-time pack holder, no membership) — **teal identity** (`#0ea5a5` / header gradient `linear-gradient(157deg,#0f5f5f,#0a2e2e 56%,#124a52)`). Partner access is **time-gated**: show a countdown ring with days/hours left (e.g. "5 days left", "24hr access left"). Copy "Make it permanent" upsell to become a member.
- **`pastdue`** — **amber** header (`linear-gradient(180deg,#fbbf24,#d97706)` accents), "PAUSED" chip, alert ribbon, primary CTA "Update payment to resume". Claims/partner access disabled.
- **`none`** (no plan / guest) — dark neutral header (`linear-gradient(157deg,#26262b,#161619 60%,#202027)`), entries = 0. **Two CTAs: "Become a member" AND "Buy a package"** — a one-time package also grants draw entry + catalogue access, so never gate everything behind membership alone. Header text forced white for contrast.

Header ink auto-adjusts: white on red/blue/dark, dark (`#241a02`/`#1c1c1e`) on gold.

### 3. Promo multiplier (purchase-time only)
The multiplier applies to the **free entries attached to a package at the moment of purchase** — it does **NOT** multiply entries already banked. When a promo is live the dashboard sells it to drive package buys / upgrades.

- Options: Off (1×) / 2× / 3× / 5× / 10×.
- **Promo banner** keeps ONE layout at every level; only the palette escalates: gold gradient for 1–3×, enhanced hot gradient (`linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)` at 10×; `…#ff6a3d,#e0245e 60%,#a1004b` at 5×) for 5×/10×.
- When active: a full-width top strip shows **"SPECIAL PROMO"** (left) + **"Ends in HH:MM:SS"** (right, ~24h countdown); heading stays "50% off one-time packages"; subtitle becomes "{n}× free entries on every package"; a **🔥 {n}×** badge pins to the "Get a package" button.
- Multiplier badges also appear on the **Packages** quick tile and on **upgrade-eligible tiers** in the Membership page (with free-entry counts × multiplier). On top tier (Boss) the upgrade affordance is hidden.
- Forbidden copy: never use "boost odds", "increase chance", "50% off extra entries". Correct: "50% off one-time packages", "free entries".

### 4. Theme
Light / Dark / **System**. Lives in **Settings → Appearance** (not the nav header). Persisted to `localStorage["ta-theme"]`; "system" follows `prefers-color-scheme` and updates live. A boot script sets `data-theme` before paint to avoid flash. (The prototype's toolbar toggle is a demo-only convenience — do not ship it.)

### 5. Navigation model
Bottom nav (mobile) / sidebar (desktop), 5 items:

| id | label | icon |
|---|---|---|
| `overview` | Dashboard | Grid |
| `rewards` | Rewards | Gift |
| `draws` | Draws | Ticket |
| `account-membership` | Membership | Card |
| `support` | Support | Chat |

Settings is reached via a **gear icon** in the dashboard header (mobile) and the **sidebar footer** (desktop) — not a primary nav slot.

---

## Screens / Views

### Dashboard (home)
- **Hero header** — monogram avatar (initials "DJ" — **no profile photo/cover imagery by design**), "Good evening, {name}", tier chip (crown + tier name), a circular **partner-access ring** and a **Reward portal** button (opens the separate rewards portal). Header background = package/tier color; gold seam nods to the draw. Gear icon → Settings.
- **Entries wallet** (the hero figure) — eyebrow "ENTRIES · JUNE 27 DRAW", a large tabular number (e.g. 190), and a split progress bar breaking it into **Membership** vs **One-time packs** with legend counts. Each figure appears exactly once — no redundant "total/this month".
- **Promo banner** — see Promo system.
- **Loyalty streak** — card with a "{n} months" chip, a 6-segment progress track, and copy "+250 **free entries** unlock at 6 months — {k} to go. Keep your membership active." (past-due variant = "at risk", amber).
- **Quick actions** — grid of glossy icon tiles: Packages (badge = multiplier when promo live), Redeem (count badge), Vouchers, Refer (+100), plus a second row (e.g. Draws, Milestones, Support). 44px+ hit targets.

### Rewards (separate destination)
Order matters: **Partner discounts FIRST** (they're the core benefit), then free claimables, then loyalty milestones.
- **Partner access card (leads the page)** — circular ring showing catalogue-unlocked % ("100% Catalogue unlocked · top tool brands"), with the **"Open partner portal"** button *inside* the card ("See every deal · signed in automatically via SSO", external-link glyph). Partner discounts are fulfilled on a **separate partner website via SSO** — every partner card carries an external-link affordance. No "See all".
- **Free claimables** — claim rows (e.g. "+250 free entries", "Free Mini Pack"); disabled/greyed when past due.
- **Loyalty milestones** — stepper with a gold "Next: +250 free entries" hero and a pulsing current stop.
- State-aware: guest shows a "buy a package OR become a member" unlock card; one-time shows the time-gated access window; past due shows paused styling.

### Draws
- **Segmented toggle: Major draw / Mini draws.**
- **Major draw** — hero with prize headline, live countdown (days/hrs/mins), prize picker (**"The Ultimate Tradie Setup"** vs **"Straight Cash" $10,000**), and a **"View this promotion"** button linking out to `https://toolsaustralia.com.au/promotions/{slug}` (new tab). Your entries breakdown (Membership + one-time packs, × multiplier) shown here too.
- **Mini draws** — **entries-based, not time-based**: each mini draw is different and draws once its entries max out. Show a **% filled** bar + **remaining entries**, and **the user's own entries in that specific mini draw**. (Mini-draw entry packs exist on your site but are out of scope to prototype here.)
- **How the draw works** — 3 steps: (1) Get your entries (from membership + one-time packages), (2) Entries freeze on the 27th at 8:00 PM AEST, (3) Drawn live at 8:30 PM AEST on Facebook. **No mention of partner discounts here** — they're unrelated to the draw.
- **Past winners** — cards with name, suburb, prize, cash, month.

### Membership
- **Current plan** card (tier, price, renew date / paused / none), state-aware.
- **Tier list** — Tradie / Foreman / Boss, each with entries + access; current tier flagged; upgrade-eligible tiers get a "🔥 {n}× entries" badge and multiplied free-entry counts when a promo is live.
- **One-time packages** — the six packs (Apprentice → VIP) with price, entries, access %, and access-window days.
- Manage (payment / cancel / change tier) opens the **Manage** overlay.

### Settings
- **Verify email** row (unverified → "Verify" action → verified state).
- **Editable fields**: mobile number, date of birth, profession (select), state (select) — via `Field` + `TextIn`/`SelectIn`.
- **Appearance** section — `ThemePicker` (Light / Dark / System segmented control).
- "Save changes" primary button.
- **No** billing-history section (explicitly removed).

### Overlays (responsive sheet↔modal)
- **Support** — leads with **"Ask Cobber"** (AI assistant, "Online" pulse), then "Email us" (**support@toolsaustralia.com.au · usually replies within 1–2 business days**), then a "Common questions" list. **No WhatsApp, no phone/call.**
- **Payment method** — Visa/EMV card visual, saved-cards list (set-default radio, remove), "Add a new card" form (number / expiry / CVC / name), encrypted-processing note.
- **Manage membership** — plan summary (tier, price, renew/paused/none), "Update payment method", "Change tier / Choose a plan", and a two-step **Cancel membership** confirm. Past due → "Update payment to resume". **No separate auto-renew toggle** (redundant with cancel).

---

## Interactions & Behavior
- **Navigation** — bottom nav / sidebar switch the active page (client state or route). Settings via gear/sidebar-footer. Reward portal + partner portal + "View this promotion" open external URLs (SSO / promotions) in a new tab.
- **Overlays** — open on row/button tap; mobile = slide-up bottom sheet with a grab handle + backdrop blur; desktop = centered modal (max-width ~468px) with backdrop. Close via ✕ or backdrop click.
- **Countdowns** — draw countdown (days/hrs/mins/secs) and promo countdown (HH:MM:SS) tick every second; anchor the target time once so it's stable across re-renders/navigation. In production, drive from real draw/promo end timestamps.
- **Prize picker** (Draws) — segmented control swaps the prize card content.
- **Major/Mini toggle** (Draws) — swaps the draw list.
- **Theme** — instant apply + persist; system mode listens to `prefers-color-scheme`.
- **Payment form** — add/remove cards, set default (single-select), inline add form toggle.
- **Cancel membership** — two-step confirm (guard against accidental cancel).
- **Transitions** — use `--ease: cubic-bezier(.22,1,.36,1)`; durations `--q 150ms / --b 300ms / --e 500ms`. Buttons: `active` → `translateY(1px) scale(.99)`. Promo hot banner has a slow diagonal sheen (`shimmer` keyframe, ~3.4s).
- **A11y** — focus-visible rings (`2px solid var(--red)`, offset 2px); toggle uses `aria-pressed`; hit targets ≥44px.

---

## State Management
Prototype-level state (recreate with your real hooks/session/data layer):
- `page` — active destination (`overview` | `rewards` | `draws` | `account-membership` | `settings`).
- `sheet` — open overlay (`null` | `support` | `payment` | `manage`).
- `acct` — account state (`active` | `onetime` | `pastdue` | `none`) — **from session/subscription in prod.**
- `tierId` — current tier (`tradie` | `foreman` | `boss`) — **from subscription in prod.**
- `mult` — active promo multiplier (1/2/3/5/10) — **from a live promo config in prod.**
- `themePref` — `light` | `dark` | `system`, persisted to `localStorage["ta-theme"]`.
- Local UI: prize pick, major/mini toggle, saved cards, form fields, verify state, cancel-confirm step.

Data needs in production: member profile + verification status, subscription (tier, renewal, status), entries breakdown (membership vs one-time, per draw + per mini-draw), promo config (multiplier + end time), partner catalogue + SSO link, payment methods, claimables/milestones, past winners.

---

## Design Tokens
From `styles.css` (`:root` = dark; `html[data-theme="light"]` overrides). Use your app's tokens where equivalents exist.

**Dark (default)**
- bg `#0a0a0a` · bg-2 `#0e0e0f` · surface `#161617` · surface-2 `#1d1d1f` · elev `#232325`
- line `rgba(255,255,255,.08)` · line-2 `rgba(255,255,255,.14)`
- text `#f5f5f5` · muted `#a3a3a3` · muted-2 `#737373`
- good `#34d399` · warn `#fbbf24` · inset `rgba(255,255,255,.04)`

**Light**
- bg `#f4f5f7` · bg-2 `#eef0f3` · surface `#ffffff` · surface-2 `#f7f8fa`
- line `rgba(15,23,42,.10)` · line-2 `rgba(15,23,42,.16)`
- text `#15181f` · muted `#5b6573` · muted-2 `#8a93a1`
- good `#0f9d6b` · warn `#d97706` · inset `rgba(15,23,42,.05)`

**Brand / semantic**
- red `#ee0000` (red-d `#dc2626`, red-2 `#b91c1c`, red-soft `#ff4444`) · gold `#d4af37`
- tier: tradie `#00c2ed` · foreman `#ffd200` · boss `#ee0000`
- one-time identity: teal `#0ea5a5`
- promo hot 10× `linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)` · 5× `linear-gradient(120deg,#ff6a3d,#e0245e 60%,#a1004b)`

**Radii** — lg `.625rem` · xl `.875rem` · 2xl `1.1rem` · 3xl `1.6rem` (pills use `999px`)
**Shadows** — `--shadow` `0 1px 0 rgba(255,255,255,.04) inset, 0 18px 40px -22px rgba(0,0,0,.8)`; `--shadow-lg` heavier (see file). Light-mode variants defined.
**Motion** — ease `cubic-bezier(.22,1,.36,1)`; q 150ms · b 300ms · e 500ms
**Layout** — content max-width `1180px`; desktop frame 1240px; mobile screen 400px.

**Typography**
- Display/headings: **Poppins** 600/700/800/900, letter-spacing `-.02em`, line-height ~1.04
- Body/UI: **Inter** 400–800
- Numbers: `.num` → `font-variant-numeric: tabular-nums`
- Eyebrow: Inter 700, 12px, letter-spacing `.18em`, uppercase, muted
- Google Fonts import: `Inter:wght@400;500;600;700;800` + `Poppins:wght@600;700;800;900`
- Ink-on-color helper: dark text on gold/light tiers, white on red/blue/dark (`inkOn()` in `system.js`).

---

## Assets
- **No user profile photos or cover imagery** — identity is a **monogram** (user initials) in a tier-colored rounded tile. This is an intentional design decision; do not add avatars/cover banners.
- **Partner brand logos** — referenced at `/images/partnerBrandLogos/*.webp|jpg` (already in your repo; see `data.js` `brands[]`).
- **Icons** — line icons from `system.js` (`Ic`) + a richer tool-flavored set (`Sx`/`Ix`) in `rewards-concepts.js`. Map to your existing icon library (e.g. lucide) by name where possible: Grid, Gift, Ticket, Card/CreditCard, Chat, Crown, Bolt, Trophy, Calendar, Shield, Clock, Check, Lock, Refresh, ChevronRight, Arrow, Plus, Sparkle, Star, Sun, Moon, Monitor, Flame, Medal, Headset.
- **Fonts** — Inter + Poppins (Google Fonts).

---

## Files (in this bundle)
- `Rewards Dashboard Concepts.html` — entry point; open in a browser to explore. Toolbar switches theme / tier / account state / multiplier / mobile↔desktop.
- `rewards-concepts.js` — all screens & components (React via Babel). **Primary reference.** Component names map to the table above (`ConceptHub`, `ConceptHubDesktop`, `RewardsPage`, `DrawsPage`, `MembershipPage`, `SettingsPage`, `SupportSheet`, `PaymentSheet`, `ManageSheet`, `PromoBanner`, `BottomNav`, `DeskNav`, …).
- `system.js` — shared primitives, icon set (`Ic`), helpers (`inkOn`, `shade`, `glossGrad`, `useCountdown`), theme context.
- `data.js` — the full content/data model (tiers, packs, brands, draw, prizes, steps, winners, nav, redeemables, member plan).
- `styles.css` — design tokens + base component classes (`.card`, `.glass`, `.metal`, `.dark-card`, `.ta-btn`, `.eyebrow`, `.num`, tier-ink classes) for both themes.

> Note: the prototype also contains earlier files (`App.js`, `Nav.js`, `DashboardOverview.js`, `MembershipPage.js`, `MyRewards.js`, etc.) that are **not** part of this redesign — the current design lives in the five files above. `index.dc.html` is an unrelated scaffold.
