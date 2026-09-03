# Coupon audience view + ad-URL mismatch check

> Two admin-analytics surfaces requested by the owner, 2026-09-01. Independent of each
> other; specced together because both are read-only admin views over data we already hold.
> Spec = decisions + verified facts. Tasks live in the plan.

---

## 1. Problem and done

**A — Coupon audience.** Three bonus codes mint from a Klaviyo webhook, but nothing shows
who they can reach. The owner needs "the numbers that can renew" before leaning on them.
`verified` — production: `BACKIN200` / `LOCKIN100` / `EXTRA100` all `isActive: true`,
`validForHours: 72`, minting backstop to 2031, and **0 issuances / 0 webhook calls each**
(`monthlyentrycampaigns`, `redeemableissuances`, `bonuscodewebhookcalls`, 2026-09-01).

**B — Ad-URL check.** Ads are running against the wrong landing page. `verified` —
`Draw 10 | Sales | STIHL | Sep 2026` sent **567 visits to `/promotions/makita`** (98% of that
campaign's traffic, Aug 20–31). The owner found this by hand; nothing surfaces it.

| Done when | Today | Target |
| --- | --- | --- |
| Owner can see, per code, how many customers it can reach | nothing | a count + a list, per trigger |
| Owner can open an ad in Meta Ads Manager from the admin | copy the id by hand | one click |
| A wrong-brand ad is visible without reading URLs | invisible | an icon on the ad row |

**Failure if** the mismatch icon fires on legitimate ads. A warning that cries wolf gets
ignored inside a week, and the real STIHL case goes back to being invisible.

---

## 2. Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| A1 | What "qualified" means | The **addressable population** per trigger, not current holders | Holders is 0 today and stays near-0 between sends; the owner asked for "numbers that can renew", which is a forecast. Holders shown alongside once minting starts. |
| A2 | How each audience is defined | **The trigger is the targeting** | `verified` — `trigger-eligibility.test.ts:33` pins exactly this, and each trigger names a population that by definition holds no active subscription. Do not re-derive an audience from `targetingMode` (it reads `all-active-subscribers` on all three and is vestigial for webhook codes). |
| A3 | Trigger → code map | `cancel-click`→`BACKIN200`, `checkout-start`→`LOCKIN100`, `one-time-purchase`→`EXTRA100` | `verified` — `src/config/bonusCodes.ts:22-26`. Read it, never restate it. |
| A4 | Where the counts come from | Our own collections, not Klaviyo | Klaviyo owns *when* it fires; we own *who exists*. A number we can compute and re-check beats one we cannot audit. |
| B1 | Which field the check reads | **`rawUrls`**, not `canonicalUrl` | `verified` — `canonicalizeLandingUrl` (`canonicalize-landing-url.ts:15`) returns `origin+path`, deliberately stripping the query. `rawUrls` is stored unmodified (`MetaAdDestinationService.ts:259`). 1,406 Meta ads carry `?toolbox=`, 321 `?packages=`, 41 `?toolset=`. |
| B2 | How the intended brand is resolved | Union of **slug segments AND query params** | Owner ruling 2026-09-01: `/promotions/milwaukee-kincrome` and `/promotions/milwaukee?toolbox=kincrome` are the same intent. The param form is used on brand pages. |
| B3 | When to flag | Only a **positive contradiction**: the campaign/ad names brand X, the resolved URL brand set is non-empty, and X ∉ set | Keeps the icon trustworthy. See A/B failure line. |
| B4 | A missing `?toolbox=` | **Never a finding** | Owner ruling: evergreen URLs are normal and correct. |
| B5 | Rejected: match on campaign name alone | No | `verified` — produces ~90% false positives. `D9 GM`→`/promotions/milwaukee` is GearWrench+Milwaukee working as designed; only `D10 KS`/`MS`→makita are real. Matching the campaign field is what made the owner's first report look 3.5× bigger than it is. |
| B6 | Multi-URL ads | Show every URL; flag only if **no** URL matches | `verified` — 41 Meta ads are `multiUrl: true` (carousels). "The URL" is wrong for those. |
| B7 | Ads Manager link target | `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<id>&selected_ad_ids=<adId>` | `assumed` — the documented deep-link shape; **not verified against a live account**. Confirm on first click; if wrong, only this constant changes. |

---

## 3. Starting state (verified)

- `SpendByUrlDetailRow` (`useSpendByUrlAnalytics.ts:77-95`) already carries `adId`, `adName`,
  `campaignId/Name`, `adsetId/Name`, `adFormat` — everything the deep link needs. It does
  **not** carry the landing URL.
- `SpendByUrlAggregationService.ts:59` already joins `destByAd: Map<string, { canonicalUrl, rawUrls }>`.
  **The raw URLs are already in hand; they are simply not put on the row.** That is the whole
  data change for B.
- `BrandPerformanceAdsModal` → `useSpendByUrlDetailMany` → `groupSpendByUrlDetailRowsByCampaign`
  → `CampaignTreeTable`, which renders the ad rows (`CampaignTreeTable.tsx:215-229`). That
  table is where both the link and the icon belong.
- **46 Meta ads resolve to `unknown://meta-ad/<id>`** — no destination extracted. They cannot
  be checked and must render as "unknown", never as "ok".
- Bonus-code audiences: `CancellationFlowEvent` (cancel-click), Klaviyo Started Checkout /
  our own checkout signal (checkout-start), `PaymentEvent` with `packageType: "one-time"`
  (one-time-purchase). `documented` — exact predicates to be pinned during implementation
  against `trigger-eligibility.test.ts`, which is the authority.

---

## 4. Design

**A.** A read-only service returning, per trigger: the addressable count, a bounded sample of
customers, and the current issuance/redemption counts. Surfaced through one admin route and
one card. No mutation, no minting — this view must never issue a code.

**B.** Add `canonicalUrl` + `rawUrls` to `SpendByUrlDetailRow` from the map already joined.
A pure `resolveAdUrlBrands(url)` returns the brand set from slug + params; a pure
`checkAdUrlMismatch(campaignName, adName, urls)` returns `ok | mismatch | unknown` plus the
brands involved. `CampaignTreeTable` renders the URL, an Ads Manager link, and the icon.

**Edge cases:** no destination → `unknown`; multi-URL → pass if any matches; campaign naming
0 or 2+ brands → `unknown`, never `mismatch`; slug with no known brand → `unknown`.

---

## 5. Threading checklist

| # | Location | Miss it and… | Mode |
| --- | --- | --- | --- |
| T1 | `SpendByUrlDetailRow` type + the aggregation row builder | URL/icon silently absent; UI renders blank | **silent** |
| T2 | The Mongo projection feeding `destByAd` | `rawUrls` arrives `undefined`; every ad reads "unknown" and the feature looks broken-but-quiet | **silent** |
| T3 | Brand list used by `resolveAdUrlBrands` | a brand missing from the list makes its ads unverifiable → false "unknown" | **silent** |
| T4 | `unknown://` destinations | rendered as "ok" → false confidence on 46 ads | **silent** |
| T5 | Trigger→code map read from `config/bonusCodes.ts` | a restated map drifts from the webhook's | **silent** |

All five are silent. Hence section 6.

---

## 6. Tests

New `tsx` suites, each wired to a `test:*` script (an unwired file is undiscoverable here).

| Covers | Assertion |
| --- | --- |
| B3/B4 | `/promotions/milwaukee?toolbox=gearwrench` + campaign "GearWrench" → **ok**. No `?toolbox=` → **ok**, never mismatch. |
| B2 | `milwaukee-kincrome` slug and `milwaukee?toolbox=kincrome` produce the **same** brand set. |
| B3 | The real case: campaign "STIHL", url `/promotions/makita` → **mismatch**. |
| B6 | Multi-URL where one matches → ok; none match → mismatch. |
| T4 | `unknown://meta-ad/123` → **unknown**, never ok and never mismatch. |
| T3 | Every brand in the shared list resolves from both slug and param form. |
| A2/A3 | Audience predicates match `trigger-eligibility.test.ts`; the code map is **read** from `config/bonusCodes.ts`, not restated. |

---

## 7. Phases

| # | Ships | User-visible win |
| --- | --- | --- |
| 1 | `resolveAdUrlBrands` + `checkAdUrlMismatch` + tests | none yet — but the rule is pinned before any UI depends on it |
| 2 | URL on the row + Ads Manager link in `CampaignTreeTable` | owner opens any ad in Ads Manager in one click, and sees its real URL including `?toolbox=` |
| 3 | Mismatch icon | the STIHL case is visible without reading URLs |
| 4 | Coupon audience service + admin card | owner sees how many customers each code can reach |

---

## 8. Rollback

`git revert`. No runtime flag (rule 4). Safe because every surface is **read-only admin**:
no customer sees any of it, no code is minted, no money moves. A wrong mismatch verdict
misleads one admin reading one screen — recoverable by looking at the URL shown beside it,
which is why phase 2 ships the URL before phase 3 ships the judgement.

---

## 9. Open dependencies

| Item | Owner | Asked | Blocks |
| --- | --- | --- | --- |
| Confirm the Ads Manager deep-link opens the right ad (B7 is `assumed`) | DJ | 2026-09-01 | nothing — one constant if wrong |
| Whether the 46 `unknown://` ads are worth a separate extractor fix | DJ | 2026-09-01 | nothing; they render "unknown" |
| Live run of `fix:redeemable-issuance-expiry` (changes what 188 customers see) | DJ | 2026-09-01 | nothing in this spec |
