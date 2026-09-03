# Promo — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/promo/**` | Promo CRUD, activation, list |
| _TODO_ | `/api/codes/**` | Promo code validation / redemption |

> _TODO: read [src/app/api/promo/](../../src/app/api/promo/) and [src/app/api/codes/](../../src/app/api/codes/) handlers and document each._

### `POST /api/codes/validate` — campaign-code result, personal-window expiry (2026-08-25)

**The decision lives in the service, not the route.**
[`CampaignCodeValidationService.validate({ code, userId })`](../../src/services/redeemables/CampaignCodeValidationService.ts)
owns it; the route parses, rate-limits, resolves identity, and shapes the response. It was briefly a
`validateAsCampaign` function exported from `route.ts` so a service test could import it — that is a
layering violation (two Mongo queries, a policy predicate, and customer-facing dated copy inside a
route handler) and the same one R12 removed from the redeem route.

**Identity comes from the SESSION, never from the request body.** `inviteeUserId` in the body is a
**referral-graph input** and is passed only to the referral leg. It used to be forwarded to the
campaign leg as an identity claim, on an endpoint that has no auth — so anyone holding a code (these
are mass-distributed by email and freely forwardable) plus a victim's ObjectId could read back three
distinguishable answers about that named customer: that they held the code, that they had spent it,
and the exact instant of their personal window. With no session the service answers from the
campaign window alone, which is what guest checkout needs and discloses nothing. A malformed id is
treated as a guest rather than raising a `CastError` into a 500.

**This endpoint is a PREVIEW, not the gate.** It cannot answer per-customer for a guest, and the
population these codes target *is* guests (step-1 registration does not authenticate). The
authoritative check runs server-side in the four Stripe routes that write `campaignCode` into
metadata — see [rewards-redeemables rules.md R3c](../rewards-redeemables/rules.md). Do not treat a
`valid: true` from here as permission to grant anything.

**Session resolution failures are NOT swallowed.** `resolveCallerId` catches exactly one case —
calling `getServerSession` outside a Next request scope, which only happens in a tsx test harness
— and rethrows everything else, so the route 500s. A guest is `getServerSession` *returning* null,
which needs no catch. Silently downgrading a signed-in customer to the guest answer would tell them
a code applies when it may not, which is the failure this branch exists to close; a visible 500 is
the honest answer to "we could not determine who is asking".

**Rate limited** at 60/min per client (`createRateLimiter("codes-validate", …)`), matching the
sibling public validator `/api/promo/link/validate`.

The service returns a machine-readable `reason` alongside the customer-facing `message`, so the
route can tell "matched nothing" from "matched, but not for you" without comparing display strings:

| `reason` | `message` | When |
|---|---|---|
| `not_found` | `"Invalid campaign code"` | No active campaign matched (legacy campaign window closed, or the code doesn't exist). |
| `not_held` | `"This code isn't available on your account."` | The caller is identified and holds **no issuance** for the campaign. |
| `already_redeemed` | `"This code has already been redeemed."` | The issuance is `redeemed`, **or** it carries `redeemedEverAt` under a personal-window campaign (a refunded grant). |
| `expired` | `` `This code expired on ${formatExpiryLabelAEST(expiresAt)}.` `` | Personal-window campaign, and **this customer's** own `expiresAt` has passed — even though the campaign's `endsAt` backstop no longer blocks the lookup. |

`not_held` closes a "pays and gets nothing" hole: checkout used to answer `valid: true` on the
campaign window alone, while `RedemptionService.redeem` returns `campaign_not_found` for a non-holder
and `checkAndRedeemCampaign` treats that as non-blocking. The modal had already shown APPLIED and
threaded `campaignCode` into Stripe metadata, so a shared code meant the customer paid, saw no error
anywhere, and received zero entries.

The refusal sentences are **shared** with `POST /api/redeemables/redeem`, hoisted into the service
module (`CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE`, `campaignCodeExpiredMessage()`), because the two
endpoints refuse for the same reasons and used to render different strings for each — including one
missing its "on".

The route's outer `POST` handler previously collapsed EVERY invalid campaign result — including the
pre-existing "already redeemed" case — into a generic `"This code is not valid right now."`, because
the "auto" flow only returned `campaignResult` as-is when `valid: true`. It now returns the specific
result whenever `reason !== "not_found"`; the true "no such campaign" case keeps the generic wording
so an ambiguous code — one that matched no referral, promo, or campaign — still reads as generic
rather than as a false claim that it was specifically a campaign code.

See [docs/rewards-redeemables/rules.md §R9](../rewards-redeemables/rules.md#r9-the-four-campaign-window-truncation-sites-must-agree)
for the full four-site picture this endpoint is one leg of.

## Related tracking endpoints

`POST /api/tracking/promo-prize-build` — attaches the "build your prize" configurator's result to
an existing visit row. It lives under `src/app/api/tracking/**` (the `tracking` domain, not
`promo`), so it's documented in full at [docs/tracking/api.md](../tracking/api.md); the
functional core it delegates to is documented here at
[backend.md](backend.md#prize-build-core--recordprizebuild-2026-07-27).

## Cross-domain admin routes

Under `/api/admin/**` (in [admin](../admin/)):
- Promo creation / scheduling
- Banner text management
- Analytics dashboards

`GET /api/admin/promo-analytics` (route lives under the `admin` domain, see
[docs/admin/api.md](../admin/api.md)) returns, as of 2026-07-31:

- `byPage` — each row carries `visits`, `buildVisitors` (build **exposure**), `builds` (build
  **engagement**), `buildChangeRate`, `topBuiltPrize`, `buildDistribution`, signups, conversions,
  revenue and three rates. `crossVisits` was **removed**.
- `byChannel` — **renamed from `byUTMSource`**. Keyed on the canonical `ConvertingPlatform` rather
  than a raw `utm_source`; rows carry `channel` + `channelLabel`.
- `byBuiltPrize` — cross-page, grouped by the combination actually built, not by landing page.
- `dateRange` — now `{ start, end, visitsRetainedFrom, clampedToRetention }`.

`GET /api/admin/promo-analytics/channel-detail` takes **`channel`** (a closed enum of
`CHANNEL_KEYS`), not `utmSource`, and returns `channel` / `channelLabel` / `summary` / `byPage` /
`byCampaign` / `rawSources`. `GET /api/admin/promo-analytics/page-detail` returns
`buildBreakdown` in place of the removed `visitsFrom`. All three now gate on `pageAnalytics.view`
(was `promos.view`). Rationale for every one of these:
[backend.md](backend.md#page-analytics-repair--2026-07-31).

### `POST /api/codes/validate` — `reason` on refusals

Every `{ success: true, valid: false }` response now also carries a machine-readable
`reason: "not_found" | "already_redeemed" | "expired" | "not_held"`, mirroring
`CampaignCodeValidation.reason`. The referral leg, the promo leg and the generic tail all report
`not_found`; the campaign leg forwards the service's own reason.

**Why it exists.** The checkout-time resolve (`src/utils/payment/typed-code-at-checkout.ts`) picks a
different customer-facing sentence for the dominant case — a typo, which deserves the code named
back — and must do so **without comparing display strings**. `CampaignCodeValidationService`'s own
comment records why: *"a copy edit to one literal used to be able to silently change routing
behaviour."*

The field is **additive and optional-safe** — nothing that read this endpoint before looks at it.
`message` is unchanged and remains the string to show when you have no reason-specific copy.

Unchanged, and load-bearing for callers: a genuine refusal is **HTTP 200 with `success: true`**. The
`{ success: false, valid: false }` shape is reserved for a 429 (rate limit), a 400 (bad body) and a
500 (failure) — those mean *"we could not answer"*, never *"the code is bad"*.
