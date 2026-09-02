# Klaviyo — shop `is_renewal` + the inert conversion-metric env branch

**Date:** 2026-09-02
**Branch:** `fix/klaviyo-shop-is-renewal-and-conversion-metric`
**Status:** awaiting sign-off

---

## In plain English

When someone buys a t-shirt from the shop, the "we made a sale" message we send to
Klaviyo is missing one small tag: **"this was not an automatic monthly renewal."**
Every membership and pack sale carries that tag. Merchandise doesn't.

That matters because the report we want the marketing agency to use — "Marketing
Revenue" — works by looking for that tag set to *no*. A tag that was never written
doesn't read as *no*; it reads as *missing*, and missing doesn't match. So every
merchandise sale would vanish from the report that is supposed to show what
marketing actually earned.

**A worked example.** Say Jordan opens our Thursday email on 12 September 2026, clicks
through, and buys a $59 hoodie. Klaviyo credits that $59 to the Thursday campaign. In the
default "Placed Order" report the agency currently uses, the $59 shows up — but so does
every automatic membership renewal that happened to follow an email, which is why that
report reads A$46,297.70 for the month. Switch to "Marketing Revenue", which is the
honest number at A$11,597.70, and Jordan's $59 **disappears** — not because it wasn't
marketing-driven, but because the hoodie sale carries no renewal tag for the filter to
match. We would be understating the one number we are asking the agency to be judged on.

**What it looks like when it goes wrong:** nothing. No error, no alert, no gap in a
chart. The merch revenue simply is not in the total, and the total still looks like a
plausible number. That is the entire danger — this class of bug is only ever found by
someone going looking for it, which is what the September revenue audit was.

**Right now this has cost us nothing: the shop has taken zero orders.** That is the
whole reason to do it today. Klaviyo events cannot be edited after they land, and
re-sending them double-counts the money — so the day the first t-shirt sells, this
becomes permanent. Today it is one line.

The second problem is smaller and mostly not ours. There is a setting in our code
(`KLAVIYO_CONVERSION_METRIC_ID`) built to switch the admin dashboard over to that
renewals-excluded number. We tested it against the live Klaviyo account: **it does not
work today, and no change on our side can make it work.** Klaviyo's API accepts the
setting, says "success", and then hands back the all-inclusive number anyway. The
correct figure exists only in Klaviyo's own web interface. If Klaviyo ever fixes this
on their end, the setting starts working with no code change from us — which is exactly
why we are keeping it rather than deleting it. For now we label it clearly as a dead
switch, and put a note on the admin dashboard so nobody reads that number as "revenue
marketing brought in" when roughly two-thirds of it is renewals.

We are also deleting a piece of unused code that would send a *second*, duplicate
sale message to Klaviyo from the customer's browser if anyone ever wired it up.

**What we are deliberately not doing:** Klaviyo's own recommended fix is to send a
second, separate event (`Placed Non-Recurring Order`) alongside every sale. That is
the real long-term answer and it would put the correct number back within reach of
our dashboard — but it is a bigger piece of work with its own migration and reporting
questions. It gets its own spec.

---

## 1. Problem and done

Two verified defects in how purchase revenue reaches Klaviyo. **Defect 1:** the shop's
`Placed Order` emitter omits `is_renewal`, so every merchandise sale is excluded from
any Klaviyo metric or segment filtered on that property. **Defect 2:** the code path
built to read the renewals-excluded figure through the API cannot work, because
Klaviyo silently ignores custom conversion metrics in its values-reports — leaving an
env var that looks functional, is not, and is unregistered.

**Done when:**

| Criterion | Observable as |
|---|---|
| **Both** live `Placed Order` paths emit `is_renewal`, and neither line can be deleted silently | `npm run test:klaviyo-canonical` asserts value **and key presence** on the shop payload **and** on `createPlacedOrderEvent`. Today `grep -rn 'is_renewal' src/ --include=*.test.ts` returns **zero hits** (control: `package_type` returns 10), so the pre-existing flag is currently as unfenced as the shop one |
| No dead `Placed Order` emitter remains | `grep -rn 'trackPurchase' src/hooks/useKlaviyoTracking.ts` returns zero hits, and `npm run type-check` passes |
| The inert env var cannot be mistaken for a working knob | `KLAVIYO_CONVERSION_METRIC_ID` present in `.env.example` with an explicit "currently a no-op" warning; matching comment at its read site |
| Neither the admin tab **nor the Norm brief** can be misread as acquisition revenue | The Campaigns and Flows cards say the figure includes renewals, and `norm-context.md:1244` no longer claims "renewals excluded" |
| `npm run check:env` stops under-reporting | The var appears in the registry, so drift is detectable |

**Failure looks like:** shipping a change that (a) makes the inert env var appear
functional, (b) renames or removes any existing `Placed Order` property — those names
are frozen and referenced by live Klaviyo flows, or (c) leaves the shop emitter
unfenced by a test, so the same line can be deleted again silently.

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Shop `is_renewal` value | Hard-code `false` in `trackShopPlacedOrder` | Merchandise is never a subscription renewal. A parameter would invite a caller to get it wrong; there is exactly one caller. |
| Emit shape | **Additive only** — add `is_renewal`, touch nothing else | Existing property names are frozen; renaming one silently breaks live Klaviyo flows (`docs/tracking/gotchas.md:91`). |
| `KLAVIYO_CONVERSION_METRIC_ID` | Keep the branch, mark it **inert**, register it in `.env.example` with the warning | Rejected *delete*: the var is named in **two** docs (`docs/admin/api.md`, `docs/tracking/KLAVIYO_INTEGRATION.md` — `grep -rln` across `docs/`, `BUSINESS.md`, `CUSTOMER.md`) and in the published revenue audit, so a reader will come looking — better they find it labelled dead than absent and assume it was never built. Note this choice has a cost: see the `check:env` trap in §4.3. Rejected *repoint to a real event-metric id*: that is a bet on `Placed Non-Recurring Order`, which is out of scope. |
| Dead client emitter `useKlaviyoTracking().trackPurchase` | **Delete it** | Its real defect is not the missing flag — it is that a browser-side `Placed Order` would **double-count** against the authoritative webhook event. Adding `is_renewal: false` would make a landmine look correct, which is worse than either deleting or leaving it. Repo convention prefers deletion over dead code (`docs/UNUSED-VARS-CONVENTIONS.md`). |
| Admin tab wording | Amend the two `SectionTitle` subtitles | Cheapest honest fix. The number itself cannot be corrected via the API (see §3), so the only available remedy is to label it. |
| `Placed Non-Recurring Order` | **Out of scope** | Klaviyo's prescribed fix and the only route to getting the split into our dashboard, but it is a new event with its own migration, dedup and reporting questions. Separate spec. |
| Fixing the Klaviyo-side metric filter | **Out of scope, and not ours to fix in code** | The metric's filter is `{type:"numeric", operator:"equals", value:0}` against a JSON boolean. It nonetheless works in the Klaviyo UI (see §3), so it is not mis-defined — the API ignores it. No code change can affect this. |

---

## 3. Starting state (verified)

### The three `Placed Order` emitters

| # | Emitter | `is_renewal`? | Live? | Shape |
|---|---|---|---|---|
| 1 | `createPlacedOrderEvent` ← `trackPlacedOrder` ← `payment-processing.ts:1913` | ✅ always, `?? false` — [klaviyo-events.ts:736](../../../src/utils/integrations/klaviyo/klaviyo-events.ts#L736) | **Live** | membership new/renewal/proration, one-time, mini pack, upsell |
| 2 | `trackShopPlacedOrder` — [klaviyo-revenue-service.ts:194-216](../../../src/utils/integrations/klaviyo/klaviyo-revenue-service.ts#L194) | ❌ **absent** | **Live** via [finalizeShopOrder.ts:526](../../../src/services/shop/finalizeShopOrder.ts#L526) ← webhook `paymentType === "shop"` | merchandise |
| 3 | `useKlaviyoTracking().trackPurchase` — [useKlaviyoTracking.ts:125](../../../src/hooks/useKlaviyoTracking.ts#L125) | ❌ **absent** | **Dead** — zero consumers | browser-side |

`verified`. Emitter 3's deadness proved with a control: **13** call sites destructure
`useKlaviyoTracking()` (`grep -rn '= useKlaviyoTracking()' src/ | grep -v
hooks/useKlaviyoTracking.ts | wc -l` → 13), none takes `trackPurchase`; the control
search for its sibling `trackAddToCart` hits 4 files.
(`src/examples/PixelTrackingExamples.tsx` calls a `trackPurchase` from
`usePixelTracking` — a different Meta/TikTok hook, not Klaviyo.)

`verified`. Emitter 1 deliberately never fires for merchandise —
[payment-processing.ts:1851](../../../src/utils/payment/payment-processing.ts#L1851)
returns early on `packageType === "shop"`, so there is no double-emit today.

### Why an absent property is excluded, not treated as false

`verified`, and empirically, not by inference. Klaviyo's Marketing Revenue metric
reads **A$0 for every window before late May 2026**, which lines up with `is_renewal`
first landing in commit `070e1315` on **2026-05-26** (`git log -S 'is_renewal' --reverse
-- src/utils/integrations/klaviyo/klaviyo-events.ts`); the metric itself was created
2026-05-29. An event without the property matches nothing — a filter that matched
nothing would return 0 for *all* windows, so the step at the emit date is the tell.
(Draft 1 said "precisely 28 May", which over-claimed on the one date carrying the
argument.) Corroborated in code by
the comment at
[klaviyo-events.ts:731-735](../../../src/utils/integrations/klaviyo/klaviyo-events.ts#L731):
*"`is_renewal` is always defined so segments can use `EQUALS false` (Klaviyo treats
missing properties as 'not set', which doesn't match `EQUALS false`)."*

### Blast radius today: nil, and that is the point

`verified` (read-only production count, 2026-09-02):

```
READ-ONLY. Total Order docs in Production: 0
CONTROL Product docs: 2
CONTROL User docs: 57733
```

Zero merchandise orders have ever been fulfilled, so **no revenue has been
misreported yet.** PR #823 merged to `main` at `2026-08-27 20:42:51 +0800`
(`git log --merges`, commit `8bbd198b`).

`verified`. The gap could not be repaired later even if it existed: Klaviyo events are
append-only, and `trackShopPlacedOrder` sets no `unique_id`, so re-emitting would
double-count rather than correct.

### Defect 2 — the API genuinely ignores the custom metric

`verified` against the live account, 2026-09-02:

**Every row below is `timeframe: last_365_days`, `send_channel: email`, grouped by
`campaign_id`, unless the row says otherwise.** Draft 1 omitted these qualifiers and the
figures did not reproduce — a different `timeframe` key returns a different row count
(`last_12_months` → 192 rows / $247,681.49; `last_90_days` → 72 / $113,347.99). The
comparison is only meaningful *within* one timeframe, between two `conversion_metric_id`
values.

| Probe | Result |
|---|---|
| Custom metric exists | id `01KSSZVD0B3GYG7BGVE7PNCA4N`, `{"property":"is_renewal","filter":{"type":"numeric","operator":"equals","value":0}}` over base metric `TaGfFU` |
| `campaign-values-reports`, base `TaGfFU` vs custom id, **same timeframe** | HTTP 200 both; **92 rows each, 0 rows differing**, total `conversion_value` **$188,451.81 under both** — identical to the cent. Serialized attributes block character-identical (107,848 chars); only the volatile report id differs |
| **Control** — swap only `conversion_metric_id` to a different *real* metric (`SVLZpF`, Subscription Renewed), same timeframe and filters | Numbers **do** move, so the parameter is genuinely honoured. Per-campaign: `01KDH4955ZTZR94T7B8N5A5AM9` goes 24 conversions / $769.99 under `TaGfFU` → 4 / $0 under `SVLZpF`; `01KDD17HHDV3N5QWVBXZFMAG7T` goes 18 / $672.47 → 0 / $0. Both return **identical** figures under `TaGfFU` and the custom id |
| **Control** — a bogus id (`ZZZZZZ`) | `400 "Passed in conversion metric does not exist"` — ids are validated, and the custom id passes |
| `query_metric_aggregates` with the custom id | `400 "Custom metrics are not supported for this API."` |
| `query_metric_aggregates` filtering base metric on `is_renewal` | `400 "Filter dimension must be one of: Email Domain, Campaign Name, … (got is_renewal)"` |

**There is no API route of any kind to the renewals-excluded split.** The last row is
new — it means even the fallback of filtering the base metric is closed. The correct
figure exists only in the Klaviyo UI, which does apply the filter (it is what produced
A$11,597.70 against the base A$46,297.70 in the revenue audit).

`verified`. `KLAVIYO_CONVERSION_METRIC_ID` is read at
[klaviyoReporting.ts:103](../../../src/services/admin/klaviyo/klaviyoReporting.ts#L103),
is set in neither `.env.local` nor `.env.production`, and is **absent from
`.env.example`** — a CLAUDE.md rule-9 registry gap. Control: the same file registers
seven other `KLAVIYO_*` vars at lines 95-106.

### Latent failure this surfaces

`verified`. `KlaviyoEventProperties` carries an index signature
`[key: string]: string | number | boolean | undefined | null | unknown[] | Record<string, unknown>`
([klaviyo.ts:164](../../../src/types/klaviyo.ts#L164)). **`tsc` cannot catch a missing
property on any Klaviyo event payload.** This is why the flag was droppable in the
first place and why §6 is not optional.

### Docs that are already wrong

| Location | Claim | Status |
|---|---|---|
| [KLAVIYO_INTEGRATION.md:122](../../tracking/KLAVIYO_INTEGRATION.md) | "**every** `Placed Order` event carries an `is_renewal: boolean` property" | False — emitters 2 and 3 |
| KLAVIYO_INTEGRATION.md:124-129 | 4-row order-type table | Missing a merchandise row |
| KLAVIYO_INTEGRATION.md:131 | "create a custom metric … `is_renewal EQUALS false`" | Operationally the cause of the bug; also now known not to work via API |
| [rules.md:163-167](../../tracking/rules.md) | Enumerates the shop payload keys | Will be falsified by the fix |
| [testing.md:7](../../tracking/testing.md) | Enumerates every snapshot in the canonical test | Will be falsified by the new test |
| [admin/api.md:551](../../admin/api.md) | Describes `KLAVIYO_CONVERSION_METRIC_ID` resolution without the caveat | Incomplete |
| [KLAVIYO_INTEGRATION.md:529](../../tracking/KLAVIYO_INTEGRATION.md) | **Instructs the reader to set** `KLAVIYO_CONVERSION_METRIC_ID` to the Marketing Revenue metric id | The most *actionable* wrong line about defect 2 — following it achieves nothing |
| [src/docs/KLAVIYO_INTEGRATION.md:59](../../../src/docs/KLAVIYO_INTEGRATION.md) | Lists `trackPurchase` as a `useKlaviyoTracking` helper | Falsified by §4.2. **A different file** from `docs/tracking/KLAVIYO_INTEGRATION.md` — easy to miss |
| [architecture.md:233](../../infrastructure/architecture.md) | "it declares **97** vars today" | Actually 120; becomes 121 |
| [BUSINESS.md:1064](../../../BUSINESS.md) | "`Placed Order` events are tagged with `is_renewal`" | Over-claims until the fix lands |
| **[norm-context.md:1244](../../internal-norm/norm-context.md)** | "Revenue is Klaviyo-attributed `conversion_value` (**acquisition; renewals excluded**)" | **False, and the worst of these** — it is the brief fed to an external AI, asserting the exact opposite of the probe in this section |

The `norm-context.md` row is the one that actually misleads a live consumer. `verified`:
`klaviyo.analytics` is a wired `read`-tier Norm endpoint
([classification.ts:823-831](../../../src/lib/internal-norm/classification.ts#L823)), so
Norm is being told the number excludes renewals when roughly two-thirds of it is
renewals. Note that the *other* "renewals excluded" claims in that file (`:2863`,
`:2970`) are **correct and must not be touched** — they describe the server-side
advertising-analytics suite, which genuinely does exclude renewals via
`billingReason === "subscription_cycle"`. Only `:1244`, the Klaviyo-attributed figure,
is wrong.

`verified` (read directly from the file): `rules.md` has a **duplicate R9** — `:49` ("No
consent banner") and `:137` ("Shop Purchase"). Any cite of "tracking R9" is ambiguous.
Noted, not fixed here — renumbering is unrelated churn.

---

## 4. Design

### 4.1 Shop emitter

Add one property to the `properties` block in `trackShopPlacedOrder`, positioned
beside `order_type` with a comment carrying the *why*:

```ts
order_type: "shop",
order_number: params.orderNumber,
// Merchandise is never a subscription renewal. ALWAYS emitted (never omitted for the
// false case) because Klaviyo treats a missing property as "not set", which does not
// match an `EQUALS false` / `= 0` filter — so an absent flag silently drops every
// merch sale out of the "Marketing Revenue" custom metric. Same contract as
// createPlacedOrderEvent; see docs/tracking/KLAVIYO_INTEGRATION.md.
is_renewal: false,
```

No signature change: the value is a constant, not a parameter. `billing_reason` stays
absent — merchandise is not Stripe-subscription-originated, matching the existing
one-time/mini/upsell row.

### 4.2 Dead client emitter

Delete `trackPurchase` from `useKlaviyoTracking` — the `useCallback` body
([useKlaviyoTracking.ts:113-137](../../../src/hooks/useKlaviyoTracking.ts#L113)), its
entry in the returned object (`:373`), and the `trackPurchase` line from the hook's
JSDoc usage example (`:52`, `:62`). `tsc` catches any consumer we missed.

### 4.3 Conversion-metric env branch

No behaviour change. Rewrite the doc comment above `resolveConversionMetricId` to
state the verified finding and date it, and register the var in `.env.example` under
the existing Klaviyo block with a warning comment matching the
`KLAVIYO_ALLOW_DEV_PROFILE_WRITES` precedent (a multi-line `#` block above the key).

The var stays read. Setting it changes no number, but it also breaks nothing, and it
is the seam a future `Placed Non-Recurring Order` metric id would slot into.

> **Trap — registering it naively turns the env doctor permanently red.**
> `check-env.mjs` reports **MISSING** for anything declared in `.env.example` but not
> present in `.env.local`, and exits 1
> ([check-env.mjs:23,26](../../../scripts/check-env.mjs#L23)). Because this var is
> *deliberately* never given a value, a bare registration would flip
> `npm run check:env` from its current **exit 0** to exit 1 forever, and print a drift
> warning on every `npm run dev` via the `--warn` run in `predev`.
>
> **Remedy — one line, and there is an exact precedent.** `varNames()` matches on the
> **name** only (`/^([A-Za-z_][A-Za-z0-9_]*)=/`,
> [check-env.mjs:46-55](../../../scripts/check-env.mjs#L46)), so **an empty value counts
> as set**. Add `KLAVIYO_CONVERSION_METRIC_ID=` to `.env.example` *and* the same empty
> line to `.env.local`. This is exactly how `KLAVIYO_MODE=` already works — registered
> empty at `.env.example:96`, present empty in `.env.local`. **No allowlist change**:
> the `LOCAL_ONLY` list at `check-env.mjs:37-42` means "legitimately per-folder"
> (`PORT`, `E2E_*`), and putting a never-set var in it would fork that word's meaning.
>
> Per CLAUDE.md rule 9 the same empty line goes in the **main folder's** `.env.local`
> at the same time. Vercel needs nothing: absent and empty are indistinguishable to
> `process.env.KLAVIYO_CONVERSION_METRIC_ID?.trim()`.

### 4.4 Admin tab annotation

Both `SectionTitle` subtitles on the Klaviyo tab
([KlaviyoAnalyticsManagement.tsx:241,246](../../../src/components/admin/KlaviyoAnalyticsManagement.tsx#L241))
change from `Klaviyo-attributed revenue · {range}` to wording that names the
inclusion. Internal admin copy — **not** customer-facing, so CLAUDE.md rule 11 does
not apply, but it must still be accurate.

### 4.5 Edge cases and failure states

| Case | Behaviour | Note |
|---|---|---|
| Buyer has no email | `trackShopPlacedOrder` returns early at [`:190`](../../../src/utils/integrations/klaviyo/klaviyo-revenue-service.ts#L190) before building properties | Unchanged; no event, so no flag question |
| Klaviyo API times out / 5xx | Swallowed inside `trackEventBackground`'s own `.catch()` ([klaviyo.ts:1935](../../../src/lib/klaviyo.ts#L1935)); fulfilment is not failed | Unchanged. **Note the trap:** the `try/catch` wrapping the call at [finalizeShopOrder.ts:525-543](../../../src/services/shop/finalizeShopOrder.ts#L525) catches only *synchronous* payload-construction throws — `trackEventBackground` returns `void` and is fire-and-forget, so no async Klaviyo failure ever reaches it |
| Event lands but we never learn | Accepted. No `unique_id` is set, so a manual replay would double-count | Pre-existing; **not** changed here, because adding an idempotency key to a live event is a separate behavioural change |
| **Webhook dies between `markPaid` and the emit** | The `Placed Order` is **never sent**, and a redelivery cannot repair it — `markPaid` is idempotent, so a redelivered webhook returns `already_processed` at [finalizeShopOrder.ts:318,340](../../../src/services/shop/finalizeShopOrder.ts#L318), well before the emit at `:526` | `assumed` → now `verified`. Pre-existing and **out of scope**, but it means the flag fix does not make merch revenue *reliable*, only *correctly shaped when it arrives*. The redelivery branch already repairs the entry grant; it does not repair tracking |
| **Refund of a merch order** | **No `Refunded Order` is emitted at all.** `trackRefundedOrder` has exactly one caller, [refund-processing.ts:463](../../../src/utils/payment/refund-processing.ts#L463), and that file contains **zero** occurrences of `shop` or `paymentType` | `verified` — **I had this wrong in draft 1.** Even if it did fire, it builds `originalOrderId` via `extractOrderIdFromPaymentIntent(…, packageType, …)` — a *package*-shaped id that could never match the shop's `"Order ID"`, which is `order.orderNumber`. Merch refunds therefore do not subtract from Klaviyo revenue. **Pre-existing gap, out of scope**, flagged in §9 |
| Someone sets the env var anyway | Numbers do not change; the dashboard keeps showing base Placed Order | Now documented at the read site and in the registry |

---

## 5. Threading checklist

Where `is_renewal` must exist for the contract to hold.

**Rows 1-6 are silent** — event-payload keys, a call site, or prose; the index signature
at `klaviyo.ts:164` means `tsc` catches none of the code ones. **Rows 7-9 are loud** for
unrelated reasons (a doctor script and two Stop-hook blocks); they are in the table
because missing them still breaks the change, not because a type-checker would catch them.

| # | Location | Miss it and… | Loud or silent |
|---|---|---|---|
| 1 | `trackShopPlacedOrder` properties block | Every merch sale drops out of Marketing Revenue, permanently and unrecoverably | **Silent** |
| 2 | `canonical-events-shape.test.ts` assertions — **both** the shop payload and `createPlacedOrderEvent` | Row 1 can be deleted again with every suite green — exactly how it shipped. The pre-existing flag at `klaviyo-events.ts:736` is equally exposed today | **Silent** |
| 3 | **The call site** — `finalizeShopOrder.ts:526` still invokes `trackShopPlacedOrder` | Every assertion in §6 pins the payload built *inside* the function. Delete the **call** and `tsc`, lint and the new test all stay green while merch sales stop reaching Klaviyo entirely | **Silent** |
| 4 | `KLAVIYO_INTEGRATION.md:122` + table | Next engineer reads "every Placed Order carries it", trusts it, ships a fourth emitter without it | **Silent** |
| 5 | `rules.md:163-167` shop key list | The rule that governs this exact code path stays wrong about it | **Silent** |
| 6 | `norm-context.md:1244` | An external AI keeps being told the figure excludes renewals when ~2/3 of it is renewals | **Silent** |
| 7 | `.env.example` registration **plus the matching empty line in `.env.local`** | Registering alone flips `npm run check:env` to exit 1 permanently (see §4.3); omitting both leaves drift undetectable | Loud — `check:env` runs in `predev` |
| 8 | `CUSTOMER.md` touch | Stop hook `exit(2)` with `STALE CUSTOMER DOC` | **Loud** — blocks the turn |
| 9 | A `docs/tracking/` edit in the **same turn** as the `useKlaviyoTracking.ts` deletion | Stop hook `exit(2)` with `STALE DOCS` — `src/hooks/useKlaviyoTracking.ts` is a literal entry in the `tracking` domain's `paths` | **Loud** — blocks the turn |

Row 8 is mechanical: `src/utils/integrations/klaviyo/**` is a literal entry in
`CUSTOMER_TRIGGER_GLOBS` ([doc-sync.mjs:90](../../../.claude/hooks/doc-sync.mjs#L90)).
`verified`: `BUSINESS_TRIGGER_GLOBS` does **not** match any path here, and
`klaviyoReporting.ts` matches neither list (`src/services/klaviyo/**` does not cover
`src/services/admin/klaviyo/`).

`is_renewal` is **write-only** in this codebase — one executable assignment, at
`klaviyo-events.ts:736`, soon two. Control: `package_type` has 39 hits in `src/`. So
there is no reader to thread it through; the consumers are all Klaviyo-side.

---

## 6. Tests

Extend `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`
(`npm run test:klaviyo-canonical`). No new file — CLAUDE.md rule 4.

| Assertion | Covers row |
|---|---|
| Shop payload has `is_renewal === false` | 1 |
| `"is_renewal" in properties === true` on the shop payload — presence stated, not implied | 1, 2 |
| `order_type === "shop"` still present (guards against an additive edit going sideways) | 1 |
| Frozen keys `$value`, `Currency`, `Order ID`, `items` all still present | Decision "additive only" |
| **`createPlacedOrderEvent` emits `is_renewal` — `true` when `isRenewal: true`, `false` when omitted, and the key PRESENT in both cases** | 2 |

That last row is the one this spec adds beyond its own remit, and it earns its place:
`grep -rn 'is_renewal' src/ --include=*.test.ts` returns **zero hits** today (control:
`package_type` returns 10). The pre-existing flag at `klaviyo-events.ts:736` has never
been fenced, so it is deletable with `tsc` green and every suite passing — the identical
failure mode that produced defect 1. Fixing the shop emitter while leaving the original
unfenced would satisfy the letter of the task and leave the trap armed.

**Two gotchas, both verified:**

1. **Do not call `assertCanonicalShape`** on this payload. `CANONICAL_KEYS`
   ([canonical-events-shape.test.ts:28-74](../../../src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts#L28))
   contains `$value`, `Currency`, `Order ID`, `items` but **not** `order_type`,
   `order_number` or `is_renewal` — the fence would fail on the *correct* payload.
   Follow the `testOneTimePackagePurchasedCarriesHadActiveSubscription` precedent at
   `:492`, which documents this exact trap.
2. **`trackShopPlacedOrder` returns `void`** and calls `klaviyo.trackEventBackground`
   directly (`:194`), so it cannot be snapshot-tested like the pure builders. Stub the
   singleton in `require.cache` **before** the module under test is loaded. The
   mechanism is the `require.resolve(path.resolve(process.cwd(), relativeTsPath))` +
   `require.cache[resolved] = {…}` helper at
   [cancel-subscription-churn-emit.test.ts:145](../../../src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts#L145)
   — **not** the `stubKlaviyo` object literal at `:86-92`, which is only the recorder.
   Copying `:86-92` alone yields a stub that is never installed.

   **Load the module under test with `require`, never `await import`.** The precedent
   spells out why at
   [:565-570](../../../src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts#L565):
   *"under tsx a dynamic import goes through the ESM loader and bypasses
   `require.cache`, so the service would resolve the REAL … Klaviyo client. A static
   import would be hoisted above the stub installation, with the same result."* Type-only
   top-level imports are fine (erased at runtime). `package.json` declares no `type`
   field, so the project is CJS and `require` is available. Wrap the calls in
   `/* eslint-disable @typescript-eslint/no-require-imports */`, as the precedent does.

   The precedent also adds a **hard safety gate** — asserting by object identity that
   the loaded module is the stub, not the real client, before any case runs. Copy that:
   without it a silently-failed stub install turns the test into a live Klaviyo write.

Also re-run `npm run test:klaviyo-fold` (unchanged, but it is the other half of the
Klaviyo reporting surface) and `npm run type-check` after the `trackPurchase` deletion.

### Coverage of every §5 row

The done-check requires each silent row to have an assertion. Three of them **cannot** be
test-asserted — they are prose in Markdown — so their control is named explicitly rather
than left implied. A row with no control at all would be the real defect.

| §5 row | Control | Automated? |
|---|---|---|
| 1 — shop emitter | `test:klaviyo-canonical` value + presence assertions | ✅ |
| 2 — the test itself, both emitters | Nothing can fence the fence. Mitigated by putting it in an existing suite already wired to a `test:*` script, so it runs whenever the Klaviyo suite runs | ⚠️ by convention |
| 3 — the call site | `test:klaviyo-canonical` asserts `finalizeShopOrder`'s module source still references `trackShopPlacedOrder` (see below) | ✅ |
| 4 — `KLAVIYO_INTEGRATION.md` | doc-sync Stop hook forces a `docs/tracking/` edit in the same turn; **content** correctness is on review | ⚠️ partial — hook checks *touched*, not *correct* |
| 5 — `rules.md` shop key list | Same hook, same limit | ⚠️ partial |
| 6 — `norm-context.md:1244` | **Nothing automated.** CLAUDE.md rule 10 is a judgment rule; no hook covers `docs/internal-norm/`, and `norm:smoke` validates *shape*, not prose | ❌ review only |
| 7 — `.env.example` + `.env.local` | `npm run check:env`, which runs in `predev` | ✅ |
| 8 — `CUSTOMER.md` | doc-sync Stop hook `exit(2)` | ✅ |
| 9 — `docs/tracking/` edit alongside the hook deletion | doc-sync Stop hook `exit(2)` | ✅ |

Rows 4, 5 and 6 are the weakest links, and row 6 has no automation at all. This is
exactly how the `is_renewal` contract drifted in the first place: a hook can prove a doc
was *touched*, never that it is *true* — and for `norm-context.md` not even that.

**Row 3's assertion is deliberately crude.** `finalizeShopOrder` reaches Mongo, Stripe
and the print provider, so importing it into a unit test is not proportionate. Instead
read its source with `fs.readFileSync` and assert it still contains
`trackShopPlacedOrder(`. That is a weak test of behaviour but an exact test of the thing
that can silently regress — the call existing at all. Cheap, no stubbing, and it fails
loudly the moment someone deletes the call.

---

## 7. Phases

Two phases. Phase 1 is the one with a deadline attached to it.

**Phase 1 — close the revenue hole.** `is_renewal: false` on the shop emitter, the
regression test that fences it, and the tracking-doc corrections
(`KLAVIYO_INTEGRATION.md`, `rules.md`, `testing.md`) plus the `CUSTOMER.md` touch.
*User-visible win:* the first merchandise sale — whenever it happens — lands in
Marketing Revenue instead of vanishing. Ships alone and is the whole safety-critical
part.

**Phase 2 — stop the dashboard and the Norm brief lying, and the cleanup.** Delete the
dead `trackPurchase`; annotate the admin Klaviyo tab; **correct `norm-context.md:1244`**;
rewrite the `resolveConversionMetricId` comment; register `KLAVIYO_CONVERSION_METRIC_ID`
in `.env.example` **and add the empty line to `.env.local`** (§4.3); fix
`KLAVIYO_INTEGRATION.md:529`, `src/docs/KLAVIYO_INTEGRATION.md:59`, `admin/api.md:551`
and `architecture.md` (incl. the stale "97 vars"). *User-visible win:* neither an admin
reading the Klaviyo tab nor Norm answering a question about it can mistake
renewal-inclusive revenue for acquisition revenue.

**Phase 2 is hook-blocked unless it edits `docs/tracking/`.** Deleting `trackPurchase`
touches `src/hooks/useKlaviyoTracking.ts`, a literal entry in the `tracking` domain's
`paths`, so the doc-sync Stop hook demands a `docs/tracking/` edit in the same turn —
which `src/docs/KLAVIYO_INTEGRATION.md` does **not** satisfy (different directory). The
`KLAVIYO_INTEGRATION.md:529` fix discharges it. §5 row 9.

**BUSINESS.md is a Phase 1 item, not Phase 2.** [BUSINESS.md:1064](../../../BUSINESS.md)
says `Placed Order` events are tagged with `is_renewal` — Phase 1 is what makes that
true, so if it is left to Phase 2 the doc is briefly correct-by-accident and the work
item reads as already done. Fix it in the same turn as the emitter.

Phase 2 depends on nothing in Phase 1 and could be dropped without harming it.

---

## 8. Rollback

No kill switch is needed or appropriate — there is no flag, no migration, and no state
change. CLAUDE.md rule 4: commits are the rollback unit.

| Change | Reverting means | In-flight risk |
|---|---|---|
| `is_renewal: false` | `git revert`; new merch events stop carrying the flag | None. Purely additive to an event payload; nothing reads it server-side |
| `trackPurchase` deletion | `git revert` restores it | None — it has no callers to break |
| Docs / `.env.example` / admin copy | `git revert` | None |

**Recovery surface:** none required. The change cannot half-complete — the Klaviyo emit
is fire-and-forget and swallows its own errors inside `trackEventBackground`
([klaviyo.ts:1935](../../../src/lib/klaviyo.ts#L1935)), so it never fails fulfilment.
The one genuinely unrecoverable state — a merch sale emitted without the flag — is what
this spec exists to prevent, and it is **not** recoverable after the fact, which is why
Phase 1 should land before the shop takes an order.

**Norm lockstep (CLAUDE.md rule 10):** the response *shape* is **unchanged** — we touch
only a comment in `klaviyoReporting.ts`. `verified`: the gating export is
`NormKlaviyoAnalyticsSchema`
([schemas/klaviyo.ts:69](../../../src/lib/internal-norm/schemas/klaviyo.ts#L69)), built
from the **un-exported** `KlaviyoCampaignRowSchema` (`:55`), `KlaviyoFlowRowSchema`
(`:62`) and `KlaviyoChannelStatSchema` (`:43`), which describe
`entityId / email / sms / total / name / status / scheduledAt` — none of which move.
(Draft 1 of this spec named a `NormKlaviyoCampaignRowSchema`; **no such symbol exists**.) So
**no** `build:norm-manifest` and **no** `norm:smoke` are required.

**But `norm-context.md` IS required**, and for a reason unrelated to shape: `:1244`
asserts the figure is "acquisition; renewals excluded", which §3 disproves. Rule 10's
lockstep covers the brief's *semantics*, not just its types — a schema can be perfectly
valid while the prose above it tells Norm the number means the opposite of what it
means. Correcting that line is Phase 2 work, listed in §7. If Phase 2 ever grows to
change the returned `metricId`, the shape conclusion flips too and all four steps return.

---

## 9. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|
| Confirm the Klaviyo UI figure is the one to quote to the agency | DJ | 2026-09-02 | 2026-09-05 (before the agency meeting) | Nothing in this spec — the code fix is independent |
| Decide whether to pursue `Placed Non-Recurring Order` | DJ | 2026-09-02 | 2026-09-30 | A future spec; **not** this one |
| **Merch refunds emit no `Refunded Order`** (§4.5) — decide whether to close it | DJ | 2026-09-02 | 2026-09-30 | Nothing here. Pre-existing; becomes real money the first time a merch order is refunded |
| Klaviyo support ticket: values-reports silently ignore custom conversion metrics | **unassigned — needs an owner** | not raised | — | Nothing. If Klaviyo ever fixes it, the env branch we are keeping becomes live with no code change |

**How this degrades if every dependency answers "no":** it does not. All four are
follow-ups. Phase 1 and Phase 2 are self-contained and correct regardless. The last row
has no owner, so by this skill's own standard it is a **note, not a tracked
dependency** — recorded so it is not lost, not so it can be relied on.

---

## Appendix — provenance summary

Everything in §3 is `verified`; no row in it is left `documented` or `assumed`. The
live-account probes were read-only (`get_custom_metrics`, `get_campaign_report`,
`get_flow_report`, `query_metric_aggregates`, `get_events`); nothing was created,
updated or deleted in Klaviyo. The production order count was a read-only
`countDocuments` against `Production` with a control, run from a temporary probe file
that was deleted immediately after.
