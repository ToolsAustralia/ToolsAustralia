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
