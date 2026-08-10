# Contentsquare page mapping — "TA — Core Funnel"

The page-group taxonomy for Contentsquare project **598444**. This lives in the Contentsquare
dashboard (**Analysis setup → Definitions → Mappings**), **not** in this repo — it is recorded
here so it can be rebuilt exactly, reviewed in a PR, and kept in step with the routes it
describes.

Page groups are the foundation of Journey Analysis, Page Comparator, zoning and funnels. As of
2026-08-07 the project had **no mapping and no goals** (`searchMappings` → `[]`,
`searchGoals` → `[]`), which is why those features had produced nothing.

Every row below was verified against the route files on 2026-08-07 — **not** by listing
`page.tsx` files, which proves a file exists but not that a customer reaches it. Three routes that
look like pages are redirects and can never produce a pageview; see "Routes that are not pages".

## Before you build it: pick the Retail template

Categories are a **fixed taxonomy** — you cannot create custom ones — and which categories exist
depends on the **mapping template** (Informative / Retail / Service). The table below needs
**Retail**: it is the only template carrying `CATEGORY`, `PRODUCT` and `CONFIRMATION`. If those
are missing from the dropdown, recreate the mapping while it is still empty.

## How Contentsquare resolves overlapping rules

**There is no first-match-wins ordering.** Contentsquare enforces that *"one page can't be
included on two different page groups of the same mapping"* ([Mappings
FAQ](https://support.contentsquare.com/hc/en-us/articles/37271867978257-Mappings-FAQ)). When a new
group's condition claims pages an existing group owns, you get a **conflict prompt**: *refine your
condition*, or *continue and take the pages from the other group*.

1. **Create specific groups BEFORE catch-alls.** Creation order sets no precedence, but it decides
   which conflicts you meet and how cheaply they resolve.
2. **On a conflict prompt, choose REFINE — never "continue".** "Continue" *moves* pages out of the
   group that already owns them. Answering it wrongly on the `/promotions` catch-all would empty
   every brand group you just built.
3. **Keep one page template per group.** Zoning aggregates across every page in a group, so mixing
   templates yields a heatmap describing no real page. This is a hard constraint, not a
   preference — it is why `/discount` and `/my-account/settings` are not lumped together.

## The mapping

Build top to bottom. The last three are catch-alls and **will** raise a conflict prompt.

| # | Page group | Category | Operator | Path | What the page is | Live? |
|---|---|---|---|---|---|---|
| 1 | Home | HOME | matches exactly | `/` | Homepage, main organic entry | ✅ |
| 2 | Promo landing — DeWalt | OFFERS & SERVICES | matches exactly | `/promotions/dewalt` | Single-brand toolset landing, paid-traffic destination | ✅ |
| 3 | Promo landing — HiKOKI | OFFERS & SERVICES | matches exactly | `/promotions/hikoki` | ” | ✅ |
| 4 | Promo landing — Makita | OFFERS & SERVICES | matches exactly | `/promotions/makita` | ” | ✅ |
| 5 | Promo landing — Milwaukee | OFFERS & SERVICES | matches exactly | `/promotions/milwaukee` | ” | ✅ |
| 6 | Promo landing — Ryobi | OFFERS & SERVICES | matches exactly | `/promotions/ryobi` | ” | ✅ |
| 7 | Promotions — index | CATEGORY | matches exactly | `/promotions` | Prize gallery listing the combos | ✅ |
| 8 | **Prize detail** | PRODUCT | matches regex | `^/promotions/[^/]+-[^/]+$` | 21 prize pages (5 toolsets × 4 toolboxes + `cash-prize`). Also where `/promotion` redirects. **Highest-traffic group on the site** | ✅ |
| 9 | Membership | OFFERS & SERVICES | matches exactly | `/membership` | Tier/pricing page; purchase happens in a modal, not a route | ✅ |
| 10 | Mini draws — list | CATEGORY | matches exactly | `/mini-draws` | Mini-pack listing | ✅ |
| 11 | Mini draws — detail | PRODUCT | matches regex | `^/mini-draws/[^/]+$` | Individual mini draw | ✅ |
| 12 | Shop — listing | CATEGORY | matches regex | `^/shop(/brand/[^/]+)?$` | Shop index + brand listings. Catalogue is empty so it renders "Coming Soon" — but it **is** in nav, footer and home chips, so it gets real traffic | ✅ traffic, no products |
| 13 | ⚠ Shop — product | PRODUCT | matches regex | `^/shop/[^/]+$` | Product detail. `notFound()` on the empty catalogue | **Zero** until shop launches |
| 14 | ⚠ Purchase success | CONFIRMATION | matches regex | `^/(purchase-success\|checkout/success\|mini-draw-success\|upsell-success)` | All four are Stripe `return_url`s only — nothing links or pushes to them. Only a **subscription 3DS challenge** actually lands here | **Near-zero** by design |
| 15 | Account — dashboard | MY ACCOUNT | matches exactly | `/my-account` | Member dashboard; post-login destination | ✅ |
| 16 | Account — draws | MY ACCOUNT | matches exactly | `/my-account/draws` | Member's entries / draw history | ✅ |
| 17 | Account — membership | MY ACCOUNT | matches exactly | `/my-account/membership` | Plan management; cancellation is modal-driven | ✅ |
| 18 | Account — rewards | MY ACCOUNT | matches exactly | `/my-account/rewards` | Rewards tab (`/my-account/benefits` 307s here) | ✅ |
| 19 | Account — rewards catalogue | MY ACCOUNT | matches exactly | `/my-account/rewards/catalogue` | Partner-discount catalogue browse | ✅ |
| 20 | ⚠ Account — settings | MY ACCOUNT | matches exactly | `/my-account/settings` | **Canary.** In `EXCLUDED_TRACKING_PREFIXES`, so our tracker never sends a pageview | **Zero expected** |
| 21 | Account — support | HELP / SUPPORT | matches exactly | `/my-account/support` | In-account support surface | ✅ |
| 22 | Partner discount | OFFERS & SERVICES | matches exactly | `/discount` | Member partner-discount surface; in nav with a "new" dot | ✅ |
| 23 | ⚠ Rewards (public) | OFFERS & SERVICES | matches exactly | `/rewards` | Auth-gated **and** flag-gated (`REWARDS_ENABLED=false`); nav link hidden; renders a paused message | **Zero** while flag off |
| 24 | Become a partner (B2B) | FORM | matches exactly | `/partner` | **B2B lead form** — "Become a Partner". *Not* a member perk | ✅ |
| 25 | Portal transit | OFFERS & SERVICES | matches exactly | `/portal-transit` | `noindex` interstitial during partner-portal SSO hand-off | ✅ rare |
| 26 | Draw results & winners | PRESS / NEWS | matches regex | `^/(draw-results\|winners)` | Past results and winner stories | ✅ |
| 27 | Auth | FORM | matches regex | `^/(login\|reset-password\|oauth-redirect\|staff-setup)` | Login navigates for real, then pushes `/my-account` | ✅ |
| 28 | Help & support | HELP / SUPPORT | matches regex | `^/(faq\|contact)` | Public help surfaces | ✅ |
| 29 | Legal & policy | INFORMATION / LEGALS | matches regex | `^/(privacy\|terms\|competition-term-majordraw)` | Policy + competition terms | ✅ |
| 30 | ⚠ Internal — should be empty | OTHERS | matches regex | `^/(admin\|affiliate\|dev\|test-pixels\|email-preview)` | **Canary** — all in `EXCLUDED_TRACKING_PREFIXES` | **Zero expected** |
| 31 | ⚠ Promotions — unclassified | OTHERS | starts with | `/promotions` | **Canary** — a `/promotions/*` slug with no hyphen that is not one of the five toolsets | **Zero expected** |
| 32 | Account — other | MY ACCOUNT | starts with | `/my-account` | Catch-all for future sub-pages | ✅ |

## Routes that are NOT pages — deliberately absent

These render nothing; the browser never loads them, so the tag never fires. A page group for any
of them would be permanently empty.

| Route | Reality |
|---|---|
| `/promotion` | `redirect()` → `/promotions/milwaukee-milwaukee`, preserving the query string so ad attribution survives |
| `/major-draw` | `redirect()` → `/promotional/giveaway` — **that route does not exist. It 404s.** Unrelated to tracking; worth fixing separately |
| `/my-account/benefits` | 307 → `/my-account/rewards` (`next.config.ts`) |

There is also **no `/cart` and no `/checkout` index** — the cart is a Header sidebar.

## Why `/promotions` is shaped this way

Two templates live under `/promotions/` and must not share a group:

- **Toolset landings** — the five static routes in `TOOLSET_LANDING_SLUGS`
  ([promo-landing-slugs.ts](../../src/config/promo-landing-slugs.ts)). Split individually because
  Page Comparator compares page *groups*, and "does Makita beat Milwaukee" is the question paid
  traffic raises.
- **Prize detail** — everything through `promotions/[slug]`: `{toolset}-{toolbox}` plus
  `cash-prize`. **21 slugs**, not 16.

**The hyphen is the discriminator and it is load-bearing.** No toolset slug contains one; every
prize slug does. So new combos (`ryobi-gearwrench`) classify themselves with no mapping change.
Only a **new toolset brand** needs a manual group — add that step to the "Adding a promotion
brand" checklist in `promo-landing-slugs.ts`.

## The modal problem — read before adding artificial pageviews

`ModalContainer` calls `history.pushState(state, "")` on open — **same URL, new history entry**
([ModalContainer.tsx:376](../../src/components/modals/ui/ModalContainer.tsx#L376)). The tag-side
CSTC snippet listens on `popstate, pushState, replaceState`, so **every modal open currently emits
a phantom artificial pageview for the page you are already on**, and `?packages=` /
`?open=subscription` query edits (`replaceState`) do the same.

That makes the R11 double-count worse than a 2× on navigations:

| Event | Our tracker | CSTC snippet | Recorded |
|---|---|---|---|
| SPA navigation | 1 | 1 | **2** |
| Modal open (same URL) | 0 | 1 | **1 phantom** |
| Query-param edit | 0 | 1 | **1 phantom** |

`/membership` is worst hit — it is both a high-traffic page and the one whose modal opens most.
Disabling the CSTC snippet fixes all three rows at once.

Consequence for funnels: the membership purchase, registration, cancellation, upsell and
mini-draw purchase flows are **entirely modal-driven** and produce no legitimate URL change, so a
URL mapping cannot see them. Fixing that needs deliberate artificial pageviews for modal steps —
but only **after** the CSTC snippet is off, or you are adding a third source to a double-count.

## ⚠ Structural break in the data: 4 August 2026

**Do not compare across this date.** Paid traffic stopped pointing at `/membership` on 4 August
2026 and moved to the prize pages. The effect is stark:

| Jul 28 | Jul 31 | Aug 3 | **Aug 4** | **Aug 5** | Aug 6 |
|---|---|---|---|---|---|
| 7,976 | 6,942 | 6,241 | **1,453** | **23** | 41 |

Site-wide traffic did not change (~7,000 visits/day throughout) — only the entry point did. So
`/membership` views before 4 August are **ad landing traffic**; after, they are **organic /
internal navigation only**, running at ~30/day.

Consequences when reading anything in this project:

- **Analyse from 5 August onward** for anything describing the current funnel. Mappings are
  retroactive, so the earlier data is available — but it describes a different acquisition mix,
  and any week-over-week or month-over-month comparison spanning 4 August is meaningless.
- **`/membership` organic demand is genuinely tiny** — ~30 views/day against ~7,000 site visits.
  Nobody browses to the tier page on their own; they arrive on a prize page and convert from
  there.
- **Which means the conversion path is now invisible.** Membership purchase runs through a modal
  opened on prize pages, and modals change no URL — so Contentsquare cannot see the funnel that
  produces the revenue. Adding deliberate artificial pageviews for the modal steps is therefore
  not a nice-to-have; it is the only way to measure the main conversion path. Do it **after** the
  CSTC snippet is disabled (see R11), never before.

## Coverage: aim at traffic, not pages

Traffic coverage is *"the % of the total site **traffic** included in page groups… not about the
number of pages"*. Traffic here is concentrated — Prize detail alone is roughly two-thirds of
pageviews — so ~15 groups clears 90% and the long tail buys almost nothing. Include a page when it
carries traffic, is a funnel step worth measuring, is a canary, or will matter soon (shop).

Ungrouped pages show as **"undefined"** in Journey Analysis, which is what groups 31 and 32 exist
to prevent.

For per-combo or per-page depth, build a **second mapping** rather than splitting this one —
Contentsquare selects a mapping per analysis, so a coarse "Core Funnel" and a detailed "Prize
Pages" mapping can coexist.
