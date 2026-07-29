# Design: Prize build in URL params — in-place selection + build attribution

**Date:** 2026-07-27
**Status:** Approved approach, pending spec review
**Domains:** `promo` (`docs/promo/`), `tracking` (`docs/tracking/`), `metrics-analytics`, `admin`

---

## 1. Problem

Two problems, one root cause.

### 1a. The scroll jump (a live bug)

On a brand landing page (`/promotions/makita`, `/promotions/milwaukee`), picking a **toolbox**
or the **cash opt-out** in "Build your prize" snaps the visitor to the top of the page.

Reproduced on production 2026-07-27 (`/promotions/makita`, scrolled to the Build-your-prize
section, clicked a toolbox reel card):

| t | `scrollY` | `document.scrollHeight` | URL |
|---|---|---|---|
| 52 ms | 2769 | 9122 | `?toolbox=kincrome` |
| **115 ms** | **0** | 9122 | `?toolbox=sidchrome` |

The page height never changes and no route loader appears — so this is **not** a re-render
collapse or a navigation. It is the App Router resetting scroll, **despite** `{ scroll: false }`
at [`PrizeShowcase.tsx:204`](../../../src/components/sections/promo/PrizeShowcase.tsx).

The cause is already documented in this codebase, from DJ's own earlier finding at
[`useMembershipModalDeepLink.ts:97-107`](../../../src/hooks/useMembershipModalDeepLink.ts):

> `router.replace` in Next.js App Router triggers an RSC stream refetch on every call — visible
> as repeated `GET /promotions/<slug>?utm_*` entries in the dev server terminal (even though the
> browser network tab is silent because nothing is navigating). … `history.replaceState` updates
> the URL bar WITHOUT touching the router — no RSC refetch, no log spam, no chance of cascading
> re-renders.

Only the **toolbox** lane and the **cash** opt-out write to the URL, which is exactly why only
those jump. The **toolset** lane writes nothing at all — hence problem 1b.

### 1b. The built combination is invisible to analytics

Commit `87f18d78` made prize selection happen **in place** and removed the old
`router.push('/promotions/{nextSlug}')`. That was the right UX call, but every prize-level
metric keys off the **pathname slug**, never the query:

| Stage | Source | Keyed on |
|---|---|---|
| Visit | [`usePromoPageTracking.ts:39`](../../../src/hooks/usePromoPageTracking.ts) | pathname regex → `PromoAnalyticsVisit.slug` |
| Signup | [`MembershipModal/index.tsx:1446`](../../../src/components/modals/MembershipModal/index.tsx) | same pathname regex → `User.signupAttribution.promotionSlug` |
| Purchase | [`payment-processing.ts:423`](../../../src/utils/payment/payment-processing.ts) | inherited from signup → `PaymentEvent.data.promotionSlug` |

`?toolbox=` is read by **nothing** in the tracking chain. So a visitor who lands on
`/promotions/makita` and builds `makita-kincrome` is recorded as `makita` end to end. Which
brands people actually *choose* is currently unknowable.

Note this is **not** a regression that the old redirect handled better. The redirect destroyed a
different fact: the moment it pushed to `/makita-sidchrome`, the fact that the ad had sent the
visitor to `/milwaukee-kincrome` was gone — the destination recorded itself as the landing page,
and one visitor became two visit rows. The model below keeps **both** facts on one row.

---

## 2. The model

> **Path = where they landed. Params = what they did.**

The evergreen and brand URLs remain pure landing/personalisation surfaces. Interaction inside
the card is expressed in query params and never moves the path.

| Landed on | Switches to | URL becomes | Recorded as |
|---|---|---|---|
| `/promotions/makita` | Milwaukee toolset | `…/makita?toolset=milwaukee&toolbox=milwaukee` | landed `makita`, built `milwaukee-milwaukee` |
| `/promotions/milwaukee-kincrome` | Makita toolset + Sidchrome box | `…/milwaukee-kincrome?toolset=makita&toolbox=sidchrome` | landed `milwaukee-kincrome`, built `makita-sidchrome` |
| `/promotions/makita` | nothing | `…/makita` (clean) | landed `makita`, built `makita-milwaukee`, **0 switches** |

The built prize rides **alongside** the landing slug as a second dimension. It does not replace
it. Existing rows keep their identity and their meaning, so history stays comparable.

---

## 3. Confirmed decisions

1. **URL writes use `window.history.replaceState`, never `router.replace`.** Precedent and
   rationale: `useMembershipModalDeepLink.ts:97-113`. `replaceState` cannot scroll (browser
   spec) and adds no history entry.
2. **`replaceState`, not `pushState`.** Back must leave the page, not undo six reel spins.
3. **Params win over the page slug on mount**, so refresh / back / a shared link restore the
   exact build.
4. **Read once on mount; write on every change; never re-hydrate from the URL afterwards.**
5. **Clean URL until first interaction. From the first interaction onward, BOTH params are
   always written explicitly — including when the value equals the page default.**
6. **Record the resolved `activeSlug`, never the requested one.**
7. **Landing slug remains the attribution row identity.** `builtPrizeSlug` is additive.
8. **Cash stays `?toolbox=cash`.** Existing vocabulary — `ToolboxType = ToolboxBrand | "cash"`
   ([`constants.ts:21`](../../../src/components/sections/promo/prize-selection/constants.ts))
   already models the opt-out as a toolbox-lane value. No new param is coined for it.

### On decision 5 (why the default is written explicitly)

Today `buildToolsetLandingHref` **omits** `?toolbox=` when the value is the Milwaukee default
([`utils.ts:36`](../../../src/components/sections/promo/prize-selection/utils.ts)), for a clean
canonical URL. That is correct for a bookmark and wrong for interaction tracking: on
`/promotions/makita`, a visitor who tries Milwaukee and switches **back** to Makita would end
with no params — indistinguishable from a visitor who never touched the reels.

So presence of params **is** the engagement signal. An untouched page still has a clean
canonical URL (nothing is written until the first interaction), so SEO and shareability are
unaffected.

### On decision 4 (why mount-only reads)

The current code hydrates state **from** `?toolbox=` on every change
([`PrizeShowcase.tsx:211-220`](../../../src/components/sections/promo/PrizeShowcase.tsx)),
creating a URL → state → URL round trip. Cutting that loop is what makes this robust: React
state is the single owner and the URL is a write-mostly mirror.

### On decision 6 (why the resolved slug)

`toPrizeSlug` composes `{toolset}-{toolbox}`, but `usePrizeCatalog` falls back to
`DEFAULT_PRIZE_SLUG` when a combination has no catalog entry
([`usePrizeCatalog.ts:37-45`](../../../src/hooks/usePrizeCatalog.ts)). Recording `activeSlug`
guarantees we never persist a prize slug that does not exist, and keeps what we record identical
to what the visitor actually saw.

---

## 4. Param contract

| Param | Values | Status |
|---|---|---|
| `?toolset=` | `milwaukee` `dewalt` `makita` `ryobi` `hikoki` | **new** |
| `?toolbox=` | `milwaukee` `kincrome` `sidchrome` `cash` | **existing**, reused unchanged |

- Both parsers validate against the registries in `constants.ts`; unknown values → `null` →
  caller falls back to its normal default. No new vocabulary is coined (naming rule).
- Scope broadens from `toolsetMode` only to **every** `/promotions/*` surface — both the brand
  landing pages (`/promotions/makita`, pageType `toolset`) and the prize pages
  (`/promotions/milwaukee-kincrome`, pageType `evergreen`).
- **Non-promo surfaces** (`/`, `/my-account`) do **not** write params — they are not landing
  pages and have no promo attribution row; `localStorage["prizeToolboxType"]` keeps serving them
  unchanged. (Note the term collision in this codebase: `getPageTypeFromSlug` calls a *prize*
  page `evergreen`, while `docs/promo/frontend.md` calls `/` and `/my-account` "evergreen
  surfaces". This spec uses **pageType `evergreen`** for the former and **non-promo surfaces**
  for the latter.)
- All other params (`aff`, `packages`, UTMs) are preserved — the builder copies the existing
  `URLSearchParams` and sets only these two keys.

### Mount resolution order

```
URL params  →  page slug (slugProp)  →  localStorage (evergreen only)  →  catalog default
```

**Accepted first-paint flip:** promo pages are statically prerendered, so the first render sees
empty params and the param-derived build applies on hydration. This is the same trade-off
already accepted for `?packages=` (decision #3 of
[`2026-07-03-promotions-packages-tab-url-param-design.md`](./2026-07-03-promotions-packages-tab-url-param-design.md)).

> **Params MUST be read from `window.location.search` inside an effect — never via
> `useSearchParams()`.** Commit `e4239812` deliberately removed both `useSearchParams` and the
> `<Suspense>` self-wrap from `PrizeShowcase`: on prerendered marketing-class pages the hook
> de-opts the whole client subtree to client-only rendering (`docs/security-csp/rules.md` R8),
> and the null fallback shipped the card as nothing in the static HTML (CLS 0.4352 → 0.0566 when
> it was removed). The file now carries a comment stating that reintroducing the hook — directly
> or through a hook that calls it — **fails the build on `/`**.
>
> *(An earlier draft of this spec claimed the component "already self-wraps in `<Suspense>` for
> `useSearchParams`". That was wrong — it described pre-`e4239812` code. Corrected 2026-07-27.)*

---

## 5. Data model

Three fields, added to the visit row; two of them continue down the funnel.

| Field | `PromoAnalyticsVisit` | `User.signupAttribution` | `PaymentEvent.data` |
|---|---|---|---|
| `builtPrizeSlug` | ✅ | ✅ | ✅ |
| `toolboxSwitches` | ✅ | — | — |
| `toolsetSwitches` | ✅ | — | — |

- `builtPrizeSlug` — the **effective** build (`makita-kincrome`, `cash-prize`). Always the
  resolved `activeSlug`. On an untouched page this is the page's own default, which is correct:
  it records what the visitor had on screen. "Did they engage?" is answered by the counters, not
  by this field's absence.
- `toolboxSwitches` / `toolsetSwitches` — cumulative per page-session. Visit row only; the
  engagement question is a visit-level question.
- `slug` is unchanged and still means **the landing page**.

All three are optional, so every existing document stays valid and no migration or backfill is
required.

---

## 6. Wiring — three write paths

### 6.1 Visit (new beacon)

A second beacon **updates** the visit row created on landing. It cannot be folded into the
existing beacon: visits must be recorded on landing regardless of whether anyone interacts, and
delaying that would lose every bounced visitor.

- **Trigger:** debounced ~1s after the last reel change, plus a flush on `pagehide` /
  `visibilitychange` so a fast bouncer is still captured.
- **Payload:** `{ slug, pageType, builtPrizeSlug, toolboxSwitches, toolsetSwitches }`.
- **Server:** `findOneAndUpdate` on the most recent visit for `{ anonymousId, slug, pageType }`
  within the session window, sorted by `timestamp: -1`, `$set` only, `upsert: false`.
- **Idempotency:** the client sends **cumulative totals**, never deltas, so a retry or a double
  flush is harmless. (`$inc` would double-count.)
- **No row found** (dedup race, or no `anonymousId`): silent no-op. Never create a visit here —
  that would inflate visit counts.
- **Volume:** one write per *engaged* visitor, not per switch. Negligible beside the visit write
  itself, and the existing 90-day TTL applies unchanged.
- Follows the `after()` + injected-deps pattern of the existing beacon
  ([`promo-page-visit/route.ts`](../../../src/app/api/tracking/promo-page-visit/route.ts) →
  [`record-promo-visit.ts`](../../../src/utils/promo-analytics/record-promo-visit.ts)) so DB
  latency can never 504 it.

### 6.2 Signup

[`MembershipModal`](../../../src/components/modals/MembershipModal/index.tsx) already derives
`promotionSlug` from the pathname; it additionally sends `builtPrizeSlug`, and
`buildSignupAttribution` in
[`api/auth/register/route.ts`](../../../src/app/api/auth/register/route.ts) persists it beside
`promotionSlug` / `promotionPageType`.

> **Accuracy requirement:** the modal MUST derive the build through the **same shared parser the
> card uses**. Two independent derivations would silently drift and the numbers would lie. The
> parser lives in `prize-selection/utils.ts` and is imported by both.

Validation reuses `isValidPromoSlug`, exactly as `promotionSlug` already does, so a crawler or a
hand-edited URL cannot inject a bogus value.

### 6.3 Purchase

[`payment-processing.ts:423`](../../../src/utils/payment/payment-processing.ts) already copies
the promotion fields from `signupAttribution` onto the payment event. `builtPrizeSlug` rides the
same branch, so revenue follows the build with no new attribution path.

---

## 7. Expected results — the goal

### Behaviour (verifiable by hand)

| # | Check | Expected |
|---|---|---|
| B1 | Click any reel card mid-page on `/promotions/makita` | `scrollY` delta **0px** (today: 2769 → 0) |
| B2 | Same click | no route loader, no RSC refetch in the dev terminal |
| B3 | Switch toolset, then refresh | reopens on the **same** build |
| B4 | Share `…/makita?toolset=milwaukee&toolbox=kincrome` | recipient opens on that build |
| B5 | Press Back after six reel spins | leaves the page (does not step back through builds) |
| B6 | Land and touch nothing | URL stays clean; canonical URL unchanged |
| B7 | `…/makita?aff=ABC&packages=one-time`, then switch | `aff` and `packages` both survive |
| B8 | `?toolset=garbage&toolbox=garbage` | falls back to page default, no crash |

### Data — answerable after, impossible today

- "62% of Makita landers switch the toolset away from Makita."
- "HiKOKI is *built* 3× more often than it is *landed on*."
- "Kincrome-box builders convert at 6%; Milwaukee-box builders at 3%."
- "41% of visitors never touch the reels at all."
- Conversion rate per built combination that is a genuine rate, because visits and signups are
  finally counted on the same key.

### Explicitly unchanged (regression bar)

- Visit / signup / revenue **row counts** and their landing-page identity.
- Ad-spend matching in
  [`PrizePerformanceCard`](../../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx)
  — path-prefix based, query strings never reach it.
- The A/B assignment (server-side, per landing slug). Fragmenting buckets by build would wreck
  the experiment.
- Klaviyo `Viewed Giveaway` — fires once per route from server data.
- Non-promo surfaces (`/`, `/my-account`) and the `localStorage` toolbox preference.

---

## 8. Phases

Each ships a standalone win.

| # | Phase | Win |
|---|---|---|
| 1 | `replaceState` + `?toolset=` + mount-read + shared parser | **The jump is gone**; builds are shareable. Ships alone with zero backend work. |
| 2 | Visit-row fields + update beacon | Build + engagement land in the DB. |
| 3 | Signup + purchase attribution | The funnel closes; revenue follows the build. |
| 4 | Admin breakdown in promo analytics | You can actually see it. |

---

## 9. Assumptions (correct these if wrong)

1. **Phase 4 is in scope.** Data with no way to read it is under-built, so one breakdown in the
   existing promo analytics surface is included. Cut it if you'd rather defer.
2. **Klaviyo is out of scope.** Sending `builtPrizeSlug` as a profile property would enable an
   "abandoned their Makita + Kincrome build" flow. Flagged deliberately rather than skipped
   silently (CLAUDE.md rule 10 spirit); it is a separate integration surface and a natural
   follow-on.

---

## 10. Out of scope

- **Full exploration path** (an event per settled configuration, so you could see
  `makita → milwaukee → ryobi → makita`). Considered and rejected on write volume at ad scale;
  the counters answer the questions actually asked. Phase 2's schema does not preclude adding it
  later.
- **Replacing the landing slug** with the built prize in attribution. Rejected: it would invert
  the toolset/evergreen split and make pre-change history incomparable.
- **Server-rendered initial build** (zero first-paint flip) — same rejection as `?packages=`.
- **Backfill.** All new fields are optional; historic rows simply have no build recorded.
- **`tools-aus:from-promo-slug`.** Still writer-less (see `docs/promo/frontend.md`); this design
  does not reintroduce a writer, because the whole point is that no cross-page navigation
  happens any more.

---

## 11. Risks and edge cases

| Risk | Handling |
|---|---|
| Bogus params from crawlers / hand-edits | Parsers validate against the registries; the composed slug is validated by `isValidPromoSlug` before persisting. |
| Combination with no catalog entry | Decision 6 — persist the resolved `activeSlug`. |
| Cash opt-out | `?toolbox=cash` → `builtPrizeSlug: "cash-prize"`. |
| Visit row missing when the update beacon fires | Silent no-op; never upsert (would inflate visit counts). |
| Double-fired beacon (debounce + `pagehide`) | Cumulative totals + `$set` are idempotent. |
| Cross-page nav leaving stale params | The `appliedSlugProp` effect (`PrizeShowcase.tsx:227-234`) re-derives on a genuine `slugProp` change and must also clear the params, so page A's build cannot leak onto page B. |
| First-paint flip | Accepted; matches the `?packages=` precedent. |
| Prerender / CSP R8 | Existing `<Suspense>` boundary already covers `useSearchParams`. |

---

## 12. Verification plan

- `npm run type-check`, `npm run lint`.
- Manual matrix **B1–B8** above, on a brand page (`/promotions/makita`) and an evergreen prize
  page (`/promotions/milwaukee-kincrome`), in both light and dark mode, mobile + desktop widths.
- Confirm in the dev terminal that switching a reel produces **no** `GET /promotions/<slug>` RSC
  refetch (the tell from the `useMembershipModalDeepLink` note).
- Phase 2: switch reels, confirm exactly **one** `PromoAnalyticsVisit` document is updated —
  not created — and that the counters match the number of switches.
- Phase 3: register from a page with a non-default build; confirm
  `User.signupAttribution.builtPrizeSlug`, then complete a purchase and confirm
  `PaymentEvent.data.builtPrizeSlug`.
- Extend the existing unit tests in
  `src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts`
  (which already cover `buildToolsetLandingHref`) to the new builder/parsers.
- Doc-sync: update `docs/promo/`, `docs/tracking/`, and the domain docs for any touched
  model/route before finishing.

### Pre-existing blocker to clear first

The doc-sync Stop hook currently blocks on an **uncommitted `package.json` change already
present in this worktree** (`infrastructure` domain), unrelated to this work. Resolve or commit
that separately before landing these phases.
