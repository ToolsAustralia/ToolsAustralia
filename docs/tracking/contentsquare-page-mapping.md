# Contentsquare page mapping — "TA — Core Funnel"

The page-group taxonomy for Contentsquare project **598444**. This lives in the Contentsquare
dashboard (Settings → Mappings), **not** in this repo — it is recorded here so it can be
rebuilt exactly, reviewed in a PR, and kept in step with the route structure it describes.

Page groups are the foundation of Journey Analysis, Page Comparator, zoning and funnels. As of
2026-08-07 the project had **no mapping and no goals** (`searchMappings` → `[]`,
`searchGoals` → `[]`), which is why those features had produced nothing.

## How Contentsquare evaluates this

- Rules are evaluated **in order; first match wins**. Specific patterns must sit above general
  ones — `/shop/[slug]` above `/shop`, brand landing pages above `/promotions`.
- Rules match the **URL**. Our tag sends the **path only** (`ContentsquarePageTracker` caps it
  at 255 chars) and Contentsquare appends the query string itself, so anchor patterns on the
  path and let query strings vary.
- Keep the group count moderate. Granularity where the funnel is; coarse buckets elsewhere.

## The mapping

| # | Group | Operator | Pattern | Why it earns a group |
|---|---|---|---|---|
| 1 | **Home** | equals | `/` | Highest-traffic entry; needs its own zoning. |
| 2 | **Promo landing — brand** | regex | `^/promotions/(dewalt\|hikoki\|makita\|milwaukee\|ryobi)$` | Paid-traffic destinations. Compare brands against each other in Page Comparator. |
| 3 | **Promo landing — other** | starts with | `/promotions` | Catches `/promotions/[slug]` and the index. |
| 4 | **Promotion (legacy)** | equals | `/promotion` | Separate route from `/promotions`; keep distinct or it silently merges. |
| 5 | **Membership** | equals | `/membership` | The primary conversion surface. The zoning target that matters most. |
| 6 | **Mini draws — detail** | regex | `^/mini-draws/[^/]+$` | Above the list rule, or the list swallows it. |
| 7 | **Mini draws — list** | equals | `/mini-draws` | |
| 8 | **Shop — listing** | regex | `^/shop(/brand/[^/]+)?$` | Index + brand listings behave the same way. |
| 9 | **Shop — product** | regex | `^/shop/[^/]+$` | Below listing so `/shop/brand/...` doesn't fall in here. |
| 10 | **Purchase success** | regex | `^/(purchase-success\|checkout/success\|mini-draw-success\|upsell-success)` | All four post-purchase confirmations. The natural funnel end-step. |
| 11 | **Account — dashboard** | equals | `/my-account` | The member's landing surface; distinct from its sub-pages. |
| 12 | **Rewards & partner** | regex | `^/(rewards\|discount\|partner\|portal-transit\|my-account/rewards)` | The perks surface, spread over several routes. |
| 13 | **Account — other** | starts with | `/my-account` | Everything else under the account. Must sit **below** 11 and 12. |
| 14 | **Draws & winners** | regex | `^/(major-draw\|draw-results\|winners)` | Content surfaces, not conversion — grouped so they don't pollute funnel steps. |
| 15 | **Auth** | regex | `^/(login\|reset-password\|oauth-redirect\|staff-setup)` | Journey drop-offs here mean friction, not disinterest. |
| 16 | **Info & legal** | regex | `^/(faq\|contact\|privacy\|terms\|competition-term-majordraw)` | Low intent; bucketed to keep journeys readable. |
| 17 | **⚠ Internal — should be empty** | regex | `^/(admin\|affiliate\|dev\|test-pixels\|email-preview)` | **A canary, not a real group — see below.** |

## Group 17 is a canary — leave it in

`/admin`, `/affiliate`, `/dev` and `/test-pixels` are in `EXCLUDED_TRACKING_PREFIXES`
([should-track-route.ts](../../src/utils/tracking/should-track-route.ts)), so
`ContentsquarePageTracker` never sends a pageview for them. **If group 17 ever shows traffic,
the client-side suppression is not the only thing sending pageviews** — the tag-side CSTC
snippet (Artificial Pageview + HistoryChange) is still enabled and is bypassing the filter.

That makes this group a standing monitor for the double-count bug documented in
[rules.md R11](rules.md). Zero traffic = healthy. Any traffic = go disable the CSTC snippet and
re-check `curl -s https://t.contentsquare.net/settings/598444.json | jq .implementations`.

## Known gaps

- **`/checkout` itself has no page.** Only `/checkout/success` exists — checkout runs through a
  modal / Stripe surface, so there is no URL to group. Any funnel step between "viewed
  membership" and "purchase success" has to come from a goal or an event, not a pageview.
  This is the single biggest limitation on funnel analysis here.
- **Modal-driven flows are invisible to a URL mapping.** The membership modal, cancellation flow
  and upsell modal all occur without a navigation. If those steps matter, they need artificial
  pageviews of their own — but see R11 first: adding tag-side artificial pageviews while the
  client-side push is live is exactly what caused the double-count.
- `/my-account/settings` is replay-excluded but still groups under 13.
