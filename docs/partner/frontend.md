# Partner — Frontend

## Pages

`src/app/(site)/partner/` — partner discount catalog page (members view available discounts).

## Components

> _TODO: enumerate components specific to partner._

## Partner access duration label (2026-05-18)

`src/utils/partner-discounts/partner-access-duration.ts` exports `getPartnerAccessDurationLabel({ isSubscription, days?, hours? })` → `{ short, long } | null`. Subscriptions return `"While active"` / `"Partner access while your membership is active"` (lifecycle-gated, never a day count); one-time/mini/additional packs return their concrete `N days` / `N hours`. Used by `PackageDetailModal/Body`, `StripePaymentModal`, `SubscriptionExplainerModal`, `SubscriptionManagementModal` (Upgrade/DowngradeList), `UpgradeConfirmModal`/`DowngradeConfirmModal` `BenefitsBody`, `UpgradeSuccessToast`, and `BenefitCountdown`. Always call the helper rather than re-deriving the wording inline.

## Data sources

- TanStack Query for partner catalog reads
- Discount visibility computed server-side via `partner-catalog-visibility.ts`

## className conventions (2026-05-08)

Partner components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Site-smoothness Phase 4 cleanup (2026-05-10)

`PartnerHero.tsx` previously included `import "swiper/css"` even though the file no longer used Swiper. Phase 4 of the site-smoothness plan dropped the `swiper` package and removed this orphan import; the visual layout is unchanged. No other partner components reference Swiper.

## usePartnerDiscountSso — open the rewards portal (2026-06-24, reworked 2026-07-31)

[`src/hooks/queries/usePartnerDiscountSso.ts`](../../src/hooks/queries/usePartnerDiscountSso.ts) — the client glue for the MyRewards SSO hand-off. POSTs `/api/partner-discount/sso` and resolves to one of two outcomes: `{ kind: "redirect", redirectUrl }` or `{ kind: "consent", fields, scopeVersion }` (the 409). Uses a raw `fetch` on purpose so the feature-gate 403 doesn't force a logout (see [client-state/gotchas.md](../client-state/gotchas.md)).

> **It no longer navigates.** It used to `window.location.assign` in `onSuccess`, which made the hand-off instantaneous-and-invisible. The transit takeover now owns that moment — it has to render its success state before the browser leaves — so navigation moved to `usePortalHandoff`. Same file also exports `usePartnerDiscountConsent` (POST `/consent`).

## Portal hand-off — transit takeover + consent sheet (2026-07-31)

Three components under [`src/components/sections/rewards/`](../../src/components/sections/rewards/):

| File | What it is |
|---|---|
| `PortalHandoff.tsx` | `usePortalHandoff()` — owns the whole flow (consent branch, takeover, redirect, cancel, retry) and returns `{ start, busy, error, overlay }`. **All four "Open partner portal" CTAs use it**, so the flow behaves identically wherever it is triggered. |
| `PortalTransit.tsx` | The full-viewport takeover: handoff rail, medallion, step list, gold progress tape, footer meta. |
| `PortalConsent.tsx` | The consent disclosure — desktop dialog / mobile bottom sheet. |

**Flow:** click → `POST /sso` → either 409 → consent sheet → `POST /consent` → `POST /sso` again → takeover, or 200 → takeover directly. `overlay` is `null` when idle, so an unclicked page pays nothing; it renders through `createPortal` to `<body>`, so where a call site places it doesn't affect layout.

**Honest pacing, one endpoint.** `POST /sso` is a *single* request — there are no per-step backend milestones to subscribe to. The step index advances on a timer only up to the **last** step and parks there, so the screen can never claim "opening the portal" while the token request is still in flight; only the host flipping `phase` to `done` completes it. Splitting the route into real milestones is the only way to make the three steps literally true.

**The rig is shared, not copied.** The medallion reuses `DashboardLoader`'s keyframes (`taSeat` / `taBoltStep` / `taWrench` / `taSpark` / `taWarm` / `taSpin`) rather than redeclaring them, so the two loaders cannot drift in cadence. Only genuinely new motion is declared, namespaced `taPt*` in `globals.css`. The rig *geometry* is scaled ~0.89× from the dashboard loader's so it clears the gold rewards ring at `r=55`.

**Footer TTL says 60 min, not 60 s.** The design handoff specified "expires in 60s". That is wrong: the vendor enforces a **60-minute** TTL on the token `/generatetoken` returns ([playbook §9](igodirect-integration-playbook.md)), and our own signed JWT carries no `exp` at all.

**Accessibility.** Takeover is `role="status" aria-live="polite"`, focus moves to Cancel and is trapped there, `Esc` cancels. Consent is `role="dialog" aria-modal="true"` labelled by its title, focus-trapped, `Esc` = Not now, and the tick is a real `<input type="checkbox">` wired to the disclosure list via `aria-describedby`. Both collapse under `prefers-reduced-motion` — the step list and tape still convey progress without motion.

> **2026-07-19 route-class note:** this domain's public page(s) under `src/app/(site)/` are **nonce-CSP route class** — they must render per-request. The blanket layout `force-dynamic` was removed site-wide, so the page now carries its own explicit dynamic declaration (directly, or via the `page.tsx` server shim + `page-client.tsx` pattern when the page is a client component — segment config is ignored in "use client" files). Do not remove it; see docs/security-csp/architecture.md "Route classes".

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

_Fix round 1 (2026-07-20):_ `PartnerHero` two `<h1>` hero titles used the fallback-suffixed
`font-['[Poppins]',sans-serif]` literal (missed by the round-1 codemod) and rendered a
fallback until converted to `font-poppins`. See docs/shared-ui/tailwind-conventions.md §10.

## The browse catalogue — /my-account/rewards/catalogue (2026-07-31)

The member-facing answer to "what does my tier actually open?", which the vendor's portal
structurally cannot give: it renders locked and unlocked offers identically, never states
the tier, and offers no "available to me" filter. We hold the per-offer threshold for all
1,833 offers, so we answer it ourselves — no vendor dependency.

**Shape.** `page.tsx` is the usual server shim carrying `dynamic = "force-dynamic"` (nonce-CSP
route class); `page-client.tsx` does search, category filter, an "only what I can use" toggle
(default **on**), and renders in pages of 60 with a "Show more".

**Data.** `src/generated/partnerCatalogBrowse.ts` — a **third** generated view of the same
CSV, client-safe, `[name, categoryIndex, pct]` rows (~72 KB raw, ~24 KB gzipped).

- It is a **separate file from `partnerCatalogPreview.ts` on purpose.** Preview holds the tiny
  aggregates the Rewards *card* imports; folding the rows in there would drag the whole
  catalogue into the bundle of every surface that just wants a tier count. **Only the
  catalogue route may import the browse file.**
- It carries **no offer ids**: the portal has no per-offer deep link for an SSO-arriving
  member (vendor ask 16), so a "go to this offer" button would dump them on the portal home
  page. Names are the deliverable; redemption still happens in the portal.
- Category strings are stored once and referenced by index — 11 strings, not 1,833 copies.

### `partnerWallTiles.ts` — the marketing slice (2026-08-04)

A **fourth** generated file, for the same weight-class reason browse is separate from preview.
`PartnerBrandWall` ships on `/membership` and every `/promotions/[slug]`, so it cannot pull the
88 KB browse module; this one is ~93 rows.

- **Contents:** `[name, id, imageExt, highlight]` for offers in **Automotive + Technology that
  have artwork**. Both filters matter. The category filter is editorial — the vendor catalogue
  is a general consumer feed (877 In-Store, 224 Home & Lifestyle, 181 Beauty, 178 Eat & Drink,
  167 Fashion), and a conveyor of cafes and salons sells a rewards club, not a trade network.
  The artwork filter is because a belt of blank tiles is worse than a shorter belt — note this
  differs from the catalogue route, which deliberately degrades to a letter tile.
- **`name` is imperfect display copy — know what you are shipping.** Two known defects, both
  from the vendor feed and neither auto-detectable:
  1. **Name ≠ artwork on some offers.** 800575 is named `GUNNEDAH HYDRAULICS` but its logo
     reads **AG-FIX HYDRAULICS**.
  2. **Some "names" are marketing sentences, not businesses** — e.g. `Get Commercial pricing
     at The Good Guys`.

  The wall shows the name anyway (product decision, 2026-08-04: a named tile is far more
  legible than a bare logo) and relies on a two-line clamp to keep the long ones tidy. If a
  surface needs a *trustworthy* brand name, do not take it from here.
- **Artwork is squarish** (typically 435×330), unlike our direct partners' wide wordmarks, so
  the wall gives logo-only tiles more height (56px vs 40px) or they float in the tile.
- Regenerate with `npm run build:partner-catalog`; it prints the row count and live artwork
  coverage on every run. **Read that number rather than quoting one from a comment** — the
  52% figure in `portal-offer-url.ts` was stale for months after the in-store harvest closed
  the gap to 98%.

**Guards** (`npm run test:partner-catalog-drift`): the browse rows must be the same multiset
of `(name, category, pct)` as the server-only offers map, and filtering them by `pct <= tier`
must reproduce `PARTNER_CATALOG_TIER_COUNTS` exactly. If it drifts, the page tells a member an
offer is open when it is not — the precise failure this branch exists to fix, reintroduced on
our own side.

**Names** render through `formatPartnerOfferName()` (exported from `portal-return.ts`), so the
329 double-space location suffixes read as "Cottonwood Motor Inn, Mildura, VIC" here and in
the rewards-return banner. One formatter, both surfaces.

**Locked rows** call `buildTierUpgradeCopy()` — the same module that generates the copy we
hand the vendor for their own banner (`docs/partner/vendor-copy-contract.md`), so our wording
and theirs cannot drift.

> **Known limitation, deliberately shipped.** Browsing makes the catalogue's weakness legible:
> at 50%, 438 of the 917 open offers are single-location in-store deals and the only
> recognisable national name is Kogan. That is a merchandising problem (vendor ask 14), not a
> reason to hide the list — but expect it to surface as member feedback.

### Offer deep links (2026-07-31, revised)

The browse rows **do** link per offer, reversing an earlier call in this same branch. The
vendor serves every offer at a stable path — `{portal}/products/view_smart/{id}`, where
`view_smart` is constant — so the id we already hold is enough. `PARTNER_CATALOG_BROWSE`
therefore carries the vendor id as a fourth tuple slot (~99 KB raw, still ~24 KB gzipped).

Two constraints shape it:

- **Only OPEN offers are linked.** Sending a member to a page that will refuse them is the
  portal's mistake; reproducing it on our side would be worse. Locked rows stay plain and
  carry the upgrade line instead.
- **The link needs a live portal session.** There is no way to carry a target offer through
  the SSO hand-off (vendor ask 16), so this is a convenience for a member who has already
  been through "Open partner portal", never the primary path. It opens in a new tab
  (`rel="noopener noreferrer"`) so the catalogue stays put.

The host lives in `NEXT_PUBLIC_PARTNER_PORTAL_URL` and is read only by
[`portal-offer-url.ts`](../../src/utils/partner-discounts/portal-offer-url.ts) — one adapter,
per the vendor-name rule. **Unset ⇒ no links at all**, a deliberate safe degrade rather than
a broken href. Guarded by `npm run test:partner-catalog-drift`, which also pins every browse
row to its own id in the offers map (a row with a neighbour's id would send a member to the
wrong offer).

### Offer cards — grid, badge, and the mixed-media problem (2026-08-01)

The catalogue renders **2 cards per row on mobile, 4 on desktop** (`grid-cols-2 lg:grid-cols-4`),
each card `h-full` inside a `flex` `<li>` so a row stays level whatever the name length.

Three decisions worth not undoing:

- **The badge shows an EXTRACTED value, not the vendor's sentence.** `highlight` is prose —
  median 28 characters, up to 115 ("10% off all our goods including catering packages…").
  Truncated into a badge that reads "10% off all our go…", which is worse than nothing.
  `extractOfferValue()` pulls the number: **1,505 of 1,833 rows contain a `%`, 253 a `$`**, and
  the remaining 84 are almost all "Buy 1 Get 1 Free" or "Member only offer" — hence the `BOGO`
  and `FREE` labels rather than a silent gap. The full sentence still renders under the title,
  because the badge carries the number and the line carries the meaning (Cashback vs Discount).
- **`object-contain`, never `cover`.** Artwork is a mix of merchant logos (Lacoste's wordmark
  is 64×24) and venue photography. `cover` crops a wordmark into nonsense. Contain letterboxes
  some photos, which is the cheaper mistake. Fixed `aspect-[4/3]` keeps the grid even.
- **The no-artwork state is a designed monogram panel**, not a broken-image slot. It now covers
  only ~2% of the catalogue (was 48% before the in-store harvest — see
  [gotchas.md](./gotchas.md)), but keep it: coverage is a snapshot of a third party's media
  bucket, so it will drift back up the moment they add offers we have not re-harvested.
- **A grid of identical images is worse than no image.** The first in-store harvest used the
  vendor's `merchant_logo/`, which is the *brand* mark — eight "Explore" tours in a row all
  rendered one blue logo, reading as a broken grid rather than eight offers. The fix was to
  read each offer's own 640×480 hero from its detail page. When adding any new artwork source,
  check what it looks like **repeated down a column of the same merchant**, not just on one
  card in isolation.

**Locked cards read differently at a glance**: greyscale + dimmed artwork, a dark lock badge
carrying the required percent instead of the red value badge, muted text, no external-link
affordance, and the upgrade line ("Foreman opens this, plus 458 more offers") replacing the
discount. That contrast is the entire point of the page — it is what the vendor's portal
refuses to do, so keep the two states visually unmistakable.

### The catalogue is a conversion surface (2026-08-01)

A locked card is the strongest upsell signal we get — the member has already told us *which*
offer they want. So locked cards are not dead: the whole card links to

```
/membership?utm_source=rewards_catalogue&utm_medium=internal&utm_campaign=rewards-return&offer_id={id}
```

and an "Unlock this" CTA fades in over the artwork on hover/focus.

**No new upsell logic exists for this.** `resolvePortalReturn` already treats an `offer_id` as a
rewards-return and resolves it against our committed catalogue; `resolvePortalBannerView`
already picks the cheapest covering plan and handles guest / past-due (with and without a live
pack) / paused / active. Handing it the id reuses all of that, so the member lands on
*"You're at 50% — JB HiFi Business needs 100%"* with the right plan preselected.

`utm_source=rewards_catalogue` is the one deliberate difference from the vendor's own bounce-back.
Keeping `utm_campaign=rewards-return` (which the resolver and existing reporting key on) while
splitting the source makes a real question answerable: **how much upgrade intent does our
catalogue create, versus the portal turning people away?** That is half of TA-side move 14.

Guarded by `npm run test:partner-catalog-drift`, which builds the href and feeds it through the
real `resolvePortalReturn` — a rename on either side would otherwise silently degrade every
locked card to a generic pitch.
