# Partner — Gotchas

## Queue uses the EFFECTIVE (downgrade-preserved) subscription tier, not the billed one (2026-07-04)

`subscriptionPartnerCatalogPercent()` (`partner-discount-queue.ts`) resolves the membership's partner %
from the **effective** tier via a local `effectiveSubscriptionPackageId()` helper — the downgrade-preserved
`previousSubscription.packageId` while still within its benefit period, else `subscription.packageId`.
Previously it read the **raw** `subscription.packageId` (the billed tier), which during a
downgrade-preservation window understates the tier (e.g. Tradie 50 vs effective Foreman 75), so
`reconcilePartnerDiscountSubscriptionVsQueue` could let a mid-tier one-time pack wrongly outrank the
membership and activate a lower-% pack over the member's real access. The helper mirrors
`getEffectiveBenefits`' preservation rule **inline** because benefit-resolution imports
`calculateActivePartnerDiscountPeriod` from this module — importing `getEffectiveBenefits` back would cycle.
(Same class as the `SubscriptionExplainerModal`/`PackageDetailModal` display bug: never key a subscription's
partner tier off the raw/billed `packageId`.)

## Subscription-cancel queue removal timing

Cancel-immediately removes from queue NOW. Cancel-at-period-end does NOT remove until the period actually ends. Common mistake: assuming `cancelledAt` triggers queue removal — it doesn't. The trigger is the `end` action call.

## Past-due interaction

Past-due subscribers stay in the queue until cancelled or recovered. This is intentional — they may still recover and shouldn't lose discount access while in grace.

## Webhook ordering

If `customer.subscription.deleted` and `customer.subscription.updated` arrive close together, queue updates can race. The single-update-function pattern (P2) plus idempotent operations should handle this, but verify under load.

## Subscription partner access has no fixed duration

Subscription partner access is **lifecycle-gated**, not a fixed N-day window. A subscriber keeps partner access for as long as `user.subscription.isActive` (queue rows track `subscription.endDate`, which renews each billing cycle — see `partner-discount-queue.ts`). The `partnerDiscountDays` field on the three subscription records in `src/data/membershipPackages.ts` is therefore `0` and is **never** used to gate subscription access — only one-time / additional / mini packs have a real `partnerDiscountDays` window.

UI must not show a day count for a subscription tier. Use `getPartnerAccessDurationLabel({ isSubscription })` from `src/utils/partner-discounts/partner-access-duration.ts`: it returns `"While active"` / `"Partner access while your membership is active"` for subscriptions, and the concrete `N days` / `N hours` label for one-time/mini/additional packs. Do not re-derive this inline — call the helper so the wording stays consistent across modals, toasts, and stat strips.

## A new purchase must reconcile the queue against real time before deciding to activate vs queue

**Incident (dan_427@hotmail.com, June 2026):** a 2-day Tradie one-time pack purchased on May 28 still showed as "queued / upcoming" ~3 weeks later. Root cause: `addToPartnerDiscountQueue` decided activate-vs-queue from the stored `status === "active"` flag **without checking whether that row's window had already elapsed**. Timeline: pack #0 activated May 17–19; nothing swept the queue afterwards (see the Vercel-cron-GET gotcha in [infrastructure/gotchas.md](../infrastructure/gotchas.md)), so #0 stayed `status:"active"` with a stale past `endDate` for weeks; the May 28 pack saw that "zombie" as active, same tier (40% = 40%), and **queued behind it** instead of activating; the June 12 Foreman pack then preempted the zombie (clearing its dates → it shows `expired` with null `startDate`/`endDate`, the tell-tale of the preemption path).

**The fix** ([`partner-discount-queue.ts`](../../src/utils/partner-discounts/partner-discount-queue.ts), test `npm run test:partner-discount-queue`):
- `addToPartnerDiscountQueue` now calls `processPartnerDiscountQueue(user)` **first**, so elapsed-active rows are expired (and any genuinely-due queued item is activated) before the new purchase is placed.
- The `activeQueueItem` lookup now also requires `endDate > now` (defense in depth) — an "active" row whose window has elapsed is never treated as the active blocker.

Severity note: the bug **defers** paid access, it does not destroy or over-grant it (a stale row with a past `endDate` grants nothing — `calculateActivePartnerDiscountPeriod` checks `endDate > now`). Customers keep their paid window (12-month use-by); it just activated later than expected. So existing affected users should be **left to run their deferred window**, not have it expired — that would punish them for our bug.

## Subscriber's membership queue row goes "expired" on renewal — cosmetic, access stays correct

The membership queue row's `endDate` is set only by `handleSubscriptionQueueUpdate(user, "start")` (subscription **creation**), not on renewal. After a renewal the row carries a stale past `endDate`, so the next `processPartnerDiscountQueue` sweep (Step 2) flips it to `expired`, and `reconcilePartnerDiscountSubscriptionVsQueue` then skips re-activating expired membership rows (`if (m.status === "expired") continue;`) — so it stays expired in the persisted queue.

This is **cosmetic and does not affect access.** Subscriber partner access is derived from `user.subscription.isActive` directly (`calculateActivePartnerDiscountPeriod`, `hasActivePartnerDiscountAccess`, the admin `partnerDiscountSummary`, and the planned IGodirect SSO gate) — never from the membership queue row's `status` — and the row is excluded from `getQueueSummary().queuedItems` either way. The 2026-06-16 reconcile-on-purchase + now-working daily cron make this divergence surface in persisted data sooner, but it remains harmless. **Footgun:** any FUTURE code must derive subscriber entitlement from `subscription.isActive`, not from a membership queue row's `status`.

## Sample data

`src/data/samplePartnerDiscounts.ts` is FIXTURE data for dev. Don't ship it as a fallback in production paths.

## Server-side partner-catalog tiering: hydrate the doc, fail closed (2026-06-24)

`resolvePartnerCatalogPlanId` (partner-catalog-visibility.ts) reads `user.subscriptionPackageData` and `user.enrichedOneTimePackages` — fields that **do not exist on the stored Mongoose `IUser`**; they're constructed only inside `GET /api/users/[id]`. A server path (the MyRewards SSO/offers flow) that hands a raw or merely queue-reconciled doc straight to the resolver **mis-tiers a paying subscriber** (the fields are `undefined` → it falls through to `null`). Use [`buildPartnerCatalogContext` / `resolveMemberLevel`](../../src/utils/partner-discounts/member-level.ts), which hydrates via `getEffectiveBenefits` (downgrade-preservation aware — **never** the raw `subscription.packageId`, which is wrong during a downgrade window) and is **fail-closed**: an unresolved plan → `null`, never the `getPartnerCatalogAccessPercentForPlanId` 100-default. Test: `npm run test:member-level`. Background: [docs/auth/igodirect-sso-implementation-plan.md](../auth/igodirect-sso-implementation-plan.md) §3 (N1).

## A cold `view_smart` link does NOT trigger SSO — it dead-ends (2026-07-31)

Measured, not assumed. Requesting an offer page without a portal session:

```
/products/view_smart/{id}  →302→  {portal}/users/login  →302→  toolsaustralia.com.au/login
```

**No return-to parameter survives either hop**, so the offer is lost. And because it lands on
*our* login, an already-signed-in member is bounced straight to their dashboard — they asked
for an offer and got a page they were already past. That is worse than not linking at all.

Consequences, in order of importance:

1. **The catalogue only deep-links a WARM session.** `markPartnerPortalHandoff()` writes a
   timestamped `sessionStorage` marker just before the hand-off redirect;
   `hasPartnerPortalSession()` gates the links and trusts it for 20 minutes only (rules.md
   **R11** — a marker standing in for a third party's session state must carry a TTL; the
   original boolean version caused exactly this dead end, reported 2026-08-03). The heuristic
   is deliberately one-way: under-detecting costs a member one extra hand-off, over-detecting
   is what dead-ends them, and nothing but the hand-off writes that key.
2. **The vendor's login bouncing to ours is otherwise good behaviour** — no second password
   prompt. Worth keeping if the vendor ever reworks it. What is missing is only the return-to.
3. **Ask 16 is now MEASURED, not assumed (2026-08-03).** `/verifytoken/{token}` was tested with
   a fresh token per attempt against `/products/view_smart/21190`:

   | attempt | result |
   |---|---|
   | `?redirect=` · `?redirect_url=` · `?return=` · `?next=` · `?url=` | signed in → `/v8/home` |
   | path-append `/verifytoken/{token}/products/view_smart/21190` | signed in → `/v8/home` |

   Every form is silently ignored — the target is not rejected, it is dropped, so there is no
   error to detect and nothing to work around client-side. **Do not re-probe this hoping for a
   different answer; it needs a vendor change.** Cite this table in the ask: it converts "we
   think it doesn't support a target" into "we tested six forms and none work".

   Consequence for the UX: on a cold click we can sign the member in, but never onto the offer.
   The best available shape without a vendor change is two clicks — the cold click warms the
   session (and re-arms the marker), the next click deep-links correctly.

## Offer artwork — the path matters more than the percentage (2026-08-01)

Artwork is public (no portal session) and lives at:

```
{media}/product_image/{id}.{ext}      ext varies per offer — mostly png, jpg for some
```

**949 of 1,833 offers (52%) have one.** The bucket answers **403** for the wrong extension and
nothing in the id predicts which, so `probe-partner-catalog-images.ts` resolves `id → ext` once
and commits it; the build stamps it onto each browse row and the page builds a URL only from
that value. Never guess an extension — a miss is a doomed request through our own optimiser.

### The mistake worth remembering

An earlier pass probed `big_image/{id}.png`, reported **"64 of 1,833 (3%)"**, and then designed
around that figure — treating the letter tile as the normal case and calling artwork "a bonus
on 64 rows".

**Wrong by 16×.** `big_image/` holds the portal's home-page **hero banners**, so precisely the
handful of merchandised ids resolved there and the number looked plausible. Two sampling errors
compounded it: an 18-id sample suggesting "~50%" and a later 15-id sample suggesting "15/15"
were *both* drawn from ids seen on the portal's home page — the merchandised set by definition
— so neither measured the catalogue.

Three lessons, in order of usefulness:

1. **A wrong media path fails silently.** Every row renders a letter tile and the page still
   "works", so nothing surfaces it. `npm run test:partner-catalog-drift` now fails when coverage
   drops below 25%, with a message saying to suspect the path before believing the number.
2. **Never sample ids you have already seen somewhere.** That is the merchandised set.
3. **Read the vendor's own HTML rather than guessing URLs.** Fetching `view_smart/{id}` with a
   live session and reading the `<img src>` gave the true path in a single request — after
   several rounds of probing invented paths had produced a confidently wrong answer.

Re-run after any catalogue change:

```bash
npm run probe:partner-catalog-images   # ~3 min, tries png/jpg/jpeg/webp per id, retries once
npm run build:partner-catalog          # re-emit with the refreshed extensions
```

## Our committed catalogue is a SUBSET of what the portal shows (2026-08-01)

`offers-list-breakdown.csv` is the curated allowlist, and it is **provably missing offers the
portal merchandises on its own home page**. Sampling 11 live offer ids against the CSV:

| Live in the portal | In our CSV |
|---|---|
| BOGOHO Rewards `1066778` | **missing** |
| Supercheap Auto eGift `1065007` | **missing** |
| CAT Workwear `1050770` | **missing** |
| Choice eGift Card `1064986` | **missing** |
| MyDriver Australia `1068657` | **missing** |
| Greenwood Pharmacy, Dharma Bums, JB HiFi Business, The Good Guys, Coles eGift, Amazon eGift | present |

**5 of 11 — and not obscure long-tail rows.** BOGOHO sits in the portal's "Popular Offers".

Consequences, and why the copy had to change:

- `/my-account/rewards/catalogue` must **never claim completeness.** It previously said
  "Everything below is the real catalogue", which is false. A member who had just seen BOGOHO
  in the portal searched for it here, got nothing, and was told it did not exist.
- The empty state must not say "nothing at any membership level" either. It now says
  *"Nothing in our list matches that"* and offers to search the portal instead.
- The same gap silently degrades the **rewards-return banner**: `resolvePortalReturn` falls back
  to the generic pitch for any `offer_id` outside the allowlist, so a member blocked on one of
  these five gets a generic upsell instead of one naming the offer they wanted.

**This is a data problem, not a UI one.** Either the CSV is stale or curation dropped live
offers. Ask iGoDirect for a refreshed export — and note that the authenticated
`GET {portal}/api/v1/products/{id}` endpoint (401 without credentials) would remove the need
for a hand-maintained CSV entirely. Track it as a vendor ask alongside the redemption feed.

## Artwork: ~885 offers use vendor-internal ids we do not hold (2026-08-01)

`product_image/{offerId}.{ext}` resolves for **948** offers. The rest render artwork on the
portal but are keyed differently:

```
1067617 → merchant_logo/1031913.png  +  product_image/130470.jpeg
1067776 → merchant_logo/1032643.png  +  product_image/133695.jpeg
1050799 → product_image/1050799.png          ← the derivable pattern
```

`1031913` / `130470` are the vendor's internal **merchant** and **product** ids. They appear
nowhere in our CSV (which carries only ID, Category, Offer, Highlight, Supplier, AccessPercent),
so those URLs **cannot be derived from anything we hold** — they can only be read off each
offer's HTML, which needs a live portal session.

### RESOLVED 2026-08-03 — we harvest them (coverage 52% → 98%)

Scraping was originally judged not worth it. That was wrong, for a reason worth recording: the
cost was estimated as ~885 **detail** pages, but the category's **listing** pages carry the same
offer→image pairing 15 at a time, so phase 1 is ~60 loads, not 885. Re-costing the work changed
the answer.

[`scripts/harvest-partner-instore-artwork.ts`](../../scripts/harvest-partner-instore-artwork.ts)
(`npm run harvest:partner-instore-artwork`) signs in with a real member account, uses the normal
SSO hand-off, and runs two phases:

1. **Listing crawl** (~60 pages) — pairs every `view_smart/{offerId}` with its tile image.
   Cheap, and covers the whole category.
2. **Detail crawl** (~880 pages) — replaces each with the offer's OWN hero image.

**Phase 2 is not optional, and the reason is the whole point.** Phase 1 yields
`merchant_logo/`, which is the *brand* mark — so every offer from one merchant renders the same
picture. Eight "Explore" tours in a row all showed one blue logo, which reads as a broken grid
rather than eight offers. The detail page's 640×480 `product_image/{mediaId}` genuinely differs
per offer (verified across six offers of one merchant: 131561 / 131566 / 131572 / 131578 /
131584 / 131590). Phase 1's result is kept as a **fallback**, so a failed detail page leaves a
logo rather than reverting to a letter tile.

**The trap in phase 2:** detail pages also render a "Popular Offers" carousel whose thumbnails
are `product_image/` too, with the *same four ids on every page*. Taking "any product_image"
stamps the same picture across the entire catalogue. They are distinguished **structurally, not
by size** — carousel images sit inside `a[href*="view_smart/"]`, the hero does not. Do not
"simplify" that filter into a dimension check.

Result: **1804/1833 (98%)**. The row's `imageExt` now carries either a bare extension (keyed by
offer id, from the probe) or an explicit `"<m|p>:<mediaId>.<ext>"` reference (keyed by the
vendor's internal id, from the harvest) — always build the URL via
`buildPartnerPortalOfferImageUrl`, never by hand.

Guarded by `npm run test:partner-catalog-drift`, which now asserts a **per-category** floor as
well as an aggregate one. The aggregate alone was passing at 52% while one entire category sat
at 0% — an average hid the hole for two days. If that per-category test fails, do not lower the
floor: open one of the category's offers in the portal with a live session and read the
`<img>` src.

**The real fix is still the products API** (`GET {portal}/api/v1/products/{id}`, currently 401).
It would supply artwork, terms and live pricing for every offer and remove both the
hand-maintained CSV and this crawl. Track it with the redemption-feed ask — same credential
conversation. Until then the harvest must be re-run when the CSV changes; it is a snapshot, and
it will drift as the vendor edits merchants.

## The iframe warm-up, and the two false negatives on the way to it (2026-08-03)

An offer deep link needs a live portal session. Rather than making the member visit the portal
first, we establish the session in a **hidden iframe** — so one tap opens the offer.

Proven on production, cold start:

```
cold    view_smart/21190              -> bounced to /my-account
iframe  verifytoken -> 302 -> /v8/home   (loaded off-screen, no navigation)
then    view_smart/21190              -> view_smart/21190   ("Rockpool Cafe · 15% Discount")
```

### Two things that made this look impossible, and were not

1. **"The vendor blocks framing."** They do not — no `X-Frame-Options`, no CSP
   `frame-ancestors`. The first iframe attempt fired **zero network requests**, which reads
   exactly like the vendor refusing. It was **our own** `frame-src` in
   [`csp.ts`](../../src/utils/security/csp.ts). Always check whose policy blocked you before
   concluding anything about theirs — a blocked frame and a refused frame look identical from
   the outside.
2. **"It does not set the cookie."** It does — but only from an origin that is **same-site**
   with the portal. `myrewards.toolsaustralia.com.au` is a subdomain of ours, so a
   `SameSite=Lax` cookie is honoured in our iframe. Test the same code from `localhost` and it
   fails silently, because localhost is cross-site.

### The trap this creates, and the gate that closes it

`iframe.onload` fires **whether or not the cookie was accepted** — the frame is cross-origin,
so its document, URL and cookies are all unreadable. A cross-site attempt therefore reports
SUCCESS, and we would send the member to an offer that bounces them: the very dead end the
warm-up exists to prevent, now with extra steps.

`canWarmPartnerPortalSession()` refuses to attempt it unless `location.hostname` is same-site
with `NEXT_PUBLIC_PARTNER_PORTAL_URL`. Do not "optimise" that check away, and do not relax it
to make local dev nicer — on localhost the mechanism is **meant** to be inert, and the two-tap
fallback runs instead.

### If this ever stops working

Suspect, in order: (1) our `frame-src` lost the portal host; (2) the vendor moved off a
`toolsaustralia.com.au` subdomain, which breaks same-site and makes the gate correctly refuse;
(3) a browser began partitioning same-site subdomain frames. Cases 1 and 2 are visible in
config. Case 3 is not detectable from our side — the fallback exists for it.
