# Advertising Analytics Suite — Master Spec

**Date:** 2026-06-03
**Branch:** feature/admin-dashboard-revamp
**Status:** Design — ready for review (grounded by codebase discovery + Klaviyo API research)
**Domains touched:** `admin` (docs/admin/), `tracking` (docs/tracking/ — Klaviyo), `metrics-analytics`/dashboard-stats services.

This is a **decomposition + shared-invariants** spec. Each sub-project below gets its own focused implementation plan (via writing-plans) when we reach it. The point of this document is to lock the architecture, the cross-cutting correctness rules, the sequencing, and the per-part scope — so the four surfaces never silently disagree.

---

## 1. Goal

Turn the admin advertising surfaces from **platform-reported (pixel)** numbers into **server-side, payment-attributed** truth, and extend coverage:

- **A. True-ROAS Overview card** — the existing "Advertising" card shows server-side attributed revenue + true ROAS (spend from the ads API). *(Separate detailed spec: [2026-06-02-advertising-true-roas-design.md](2026-06-02-advertising-true-roas-design.md).)*
- **B. Per-platform hourly breakdown** — each analytics tab (Facebook, TikTok, Snapchat, Klaviyo) gets a server-side **hour-of-day** revenue breakdown exclusive to that platform.
- **C. New Klaviyo tab** — campaigns + flows with status/scheduling filters, per-campaign/flow/message marketing revenue from the Klaviyo Reporting API, email vs SMS, plus the shared hourly.
- **D. New All-Platforms aggregate tab** — ad-effectiveness only: total spend, **acquisition** revenue (renewals excluded), contribution after ad spend, overall ROAS, overall conversions, overall hourly across every platform.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| **Revenue basis** | **Acquisition-only** (new-customer attributed revenue; renewals **always excluded**) for ALL ROAS/contribution/aggregate numbers. The All-Platforms tab measures **ad effectiveness only** — it does **not** show renewal or total-gross revenue (the Overview revenue card already covers all-source revenue). |
| **Contribution / "profit" (v1)** | `revenue − ad spend` = **contribution after ad spend** (COGS, fees, returns NOT subtracted — labeled honestly, never bare "Profit"; per marketing best-practice research). Deeper margin tiers layerable later. |
| **Spend scope** | Meta spend only (live + stored). TikTok/Snapchat = "awaiting sync"; Klaviyo = "owned — n/a". TikTok/Snapchat ad-spend sync is a **separate future project**, out of scope here. |
| **Hourly model** | 24 **hour-of-day** buckets (0–23) aggregated across the selected date range (matches the existing FB pattern), in Australia/Sydney, split by **`convertingPlatform`**. Live per-request; no new rollup model. |
| **Klaviyo revenue** | **Hybrid** — Klaviyo-reported marketing revenue per campaign/flow inside the Klaviyo tab; your server-side `convertingPlatform=klaviyo_email/klaviyo_sms` revenue for channel totals on the overview card + aggregate tab. Both labeled; they will not match exactly (different attribution windows). |
| **Permissions** | Reuse `facebookAds.view` for the new Klaviyo + All-Platforms tabs. No new permission. |
| **FB account TZ** | Australia/Sydney (confirmed) → hourly spend & revenue align directly; no offset handling. |
| **Sequencing** | Phased, value-first: **A → (SHARED-1 + B) → (SHARED-2 + C) → (SHARED-3 + D)**. Each its own reviewable PR. |

## 3. Architecture

**Three shared-infra pieces, four thin surfaces.** The heavy correctness logic already exists in the daily-snapshot pipeline; most work is *generalize-and-rewire*. (Grounded by the discovery workflow, 2026-06-03.)

```
SHARED-1  Per-platform hourly revenue aggregator   ──┐ feeds B, C-hourly, D-hourly
SHARED-2  Klaviyo Reporting client                  ──┐ feeds C only
SHARED-3  Aggregate/overall stats derivation        ──┐ feeds D

A (card)        consumes existing stats payload (no backend)        [no shared dep]
B (per-tab)     SHARED-1, filtered to one platform
C (Klaviyo tab) SHARED-2 (+ SHARED-1 for the Klaviyo slice)
D (All-Plat)    SHARED-3 + SHARED-1 (all platforms)
```

### 3.1 Cross-cutting invariants (NON-NEGOTIABLE — every revenue surface must obey)

These are the rules that keep A/B/C/D reconciled with each other and with the existing overview. Verified against the daily-snapshot aggregator during discovery.

1. **Platform basis = `convertingPlatform`, NEVER `data.utmSource`.** The existing hourly method (`PaymentEventRepository.aggregateRevenueAndCountByHourOfDay`) splits revenue by a `data.utmSource` regex — that is a *different classifier* and will not reconcile with the daily snapshot. All new per-platform revenue must group by `convertingPlatform ?? 'direct'`. *(revenueAggregator.ts:77 vs PaymentEventRepository.ts:140-143)*
2. **Renewal exclusion = `packageType==='membership' && data.billingReason==='subscription_cycle'`, NEVER the top-level `isRenewal` flag** (which defaults false on historical rows and would leak old renewals into acquisition revenue). *(revenueAggregator.ts:84-89)*
3. **ROAS never sums** — recompute from summed spend ÷ summed revenue. Averaging per-platform or per-hour ROAS is wrong. *(Reader.ts:251-255)*
4. **Refunds = whole-row Option B**, keyed off the all-time `RefundProcessed` paymentIntentId Set (`loadRefundedPaymentIntentIds`). Consequence to document: a later refund retroactively zeroes a *past* hour/day bucket — historical buckets are **not immutable**. Partial refunds (`RefundPartial`) are **not** subtracted today (known limitation; carry it forward, don't silently "fix" it differently per surface). *(revenueAggregator.ts:67-68,119-122)*
5. **AEST bounds via the shared `aestDayBounds`** (DST-safe, 23h/25h days handled). Standardize on the snapshot's **exclusive `$lt`** day boundary; the existing FB hourly route uses inclusive `$lte` ending at 23:59:59.999 — a **1ms right-edge gap** vs the snapshot's exclusive next-midnight `$lt` (not a day-level error). SHARED-1 uses exclusive `$lt` for bit-identical reconciliation. *(DashboardStatsSnapshotWriter.ts:31-44)*
6. **Graceful spend degradation** — revenue + conversions for every platform; spend + ROAS only where ad spend exists (Meta). UI must never imply spend coverage that isn't there.

---

## 4. SHARED-1 — Per-platform hourly revenue aggregator

**What:** a new `PaymentEventRepository` method that returns hour-of-day (0–23) revenue + conversions, grouped by platform, for a date range.

**Shape:** one aggregation pipeline:
- `$match`: `eventType: 'BenefitsGranted'`, `timestamp` within `aestDayBounds(start..end)`, renewal-exclusion predicate (invariant #2), platform not-refunded (invariant #4 — use `loadRefundedPaymentIntentIds()`, the **all-time** RefundProcessed set, NOT a range-scoped one, else reconciliation breaks on days with later-refunded rows; prefer the distinct-Set in-memory exclusion over per-row `$lookup` for multi-day ranges).
- `$group` on `{ hour: { $hour: { date: '$timestamp', timezone: 'Australia/Sydney' } }, platform: { $ifNull: ['$convertingPlatform', 'direct'] } }`, summing `data.price` (dollars) and counting conversions.
- Zero-fill to 24 hours × the fixed **8-key `ATTRIBUTED_PLATFORM_KEYS` enum** (≤ 24×8 = 192 rows); coerce any out-of-enum `convertingPlatform` to `other`. Served by the existing `{ convertingPlatform: 1, timestamp: -1 }` index.

**Exposure:** a sibling endpoint (e.g. `GET /api/admin/analytics/hourly-revenue?platform=&start=&end=`) returning the per-platform 24-bucket series. Optionally fold into the existing stats route. Live per-request — **no new rollup model** (a single-day/short-range hour-of-day view is index-bounded; the daily-snapshot precedent already proves live "today" computation is acceptable). The endpoint returns **per-`convertingPlatform` buckets**; callers wanting a single "Klaviyo" series sum `klaviyo_email + klaviyo_sms` (merge rule stated here once, not re-derived per tab).

**Reconciliation test (required):** a `tsx` test asserting the summed hourly revenue per platform over a day equals that day's `attributedRevenue[platform].newRevenue` from the daily snapshot. Holds only when both sides use the SAME all-time refund set + `billingReason` renewal predicate + `convertingPlatform` grouping. This is the guardrail that proves invariants #1–#5 hold.

**Effort:** M (2–3 days incl. the reconciliation test).

**Risks:** classifier divergence (invariant #1), boundary `$lt` vs `$lte` (invariant #5), DST non-uniform 24h, partial-refund limitation (invariant #4).

---

## 5. SHARED-3 — Aggregate/overall stats derivation

**What:** a derived `overall` block computed **server-side in `readStatsForRange`** (where the internal `snapshotRead.attributedRevenue[*].newRevenue` and `snapshotRead.adChannels` map exist) and shipped as `stats.overall.*` — **no schema change, no migration.** Part D consumes `stats.overall` and does **not** re-derive from the per-platform payload (which renames `newRevenue → revenue` at route.ts:255 and exposes no generic `adChannels`/total-spend field on the wire — only `facebookAds` + per-platform `adSpend`).

**Key-space join (load-bearing):** spend is keyed by **provider name** (`facebook`), attribution by **`convertingPlatform`** (`meta`). Join the two ONLY via `PLATFORM_TO_AD_CHANNEL_KEY` (snapshotSchema.ts:34-43) — never by string equality of the two key spaces (`meta` revenue ↔ `facebook` spend would never match).

- `paidSpend = Σ adChannels[adKey].spend` over paid channels that have spend (Meta today).
- `paidAcquisitionRevenue = Σ newRevenue` over the **same** paid-channels-with-spend — mirrors Part A's blended-ROAS numerator so the two surfaces reconcile.
- `overallRoas = paidAcquisitionRevenue ÷ paidSpend` (recomputed from sums — invariant #3; "—" when `paidSpend === 0`). **Ad-effectiveness ROAS — owned/direct/organic revenue is NOT in the numerator** (else it inflates above true paid ROAS and disagrees with Part A).
- `contributionAfterAdSpend = paidAcquisitionRevenue − paidSpend` (labeled "Contribution after ad spend", **not** bare "Profit" — COGS/fees/returns excluded per marketing best-practice research).
- `totalAcquisitionRevenue = Σ newRevenue` across ALL channels (incl. owned/direct; renewals excluded) — a separate context headline of total new-customer revenue, NOT used as a ROAS numerator.
- `conversions = Σ attributedRevenue[*].conversions` (acquisition only).

**Effort:** S (0.5–1 day). **Risks:** revenue-basis consistency with Part A; ROAS-from-sums.

---

## 6. SHARED-2 — Klaviyo Reporting client

**Verified against Klaviyo developer docs (bounded research, 2026-06-03).** Add read-only campaign/flow/reporting methods to the existing `klaviyo` singleton (`src/lib/klaviyo.ts`), reusing its `Klaviyo-API-Key` auth, `revision` header, base URL, and 429/backoff machinery (`makeRequest` already supports GET; the reporting calls are POST). These endpoints are called nowhere today — the only genuinely-new external surface in the suite. Per the hybrid decision, this client powers the Klaviyo *tab's* per-campaign/flow revenue (Klaviyo's own attribution); it does NOT replace the server-side `klaviyo_email/klaviyo_sms` channel totals used on the overview card + aggregate tab.

**Endpoints + shapes (verified):**
- **Campaign list:** `GET /api/campaigns/?filter=equals(messages.channel,'email')` — the `filter` is REQUIRED and must include `messages.channel` (`email`/`sms`/`mobile_push`), so we query **once per channel**. Combine with `and(...)` for `status` / `scheduled_at`. `?include=campaign-messages` sideloads messages; sortable by `scheduled_at`; `page[size]` ≤ 100; cursor pagination via `links.next`.
- **Flow list:** `GET /api/flows/?filter=equals(status,'live')` — status ∈ `draft`/`manual`/`live`, `trigger_type` filterable; `page[size]` ≤ 50; full definition only via `GET /flows/{id}/?additional-fields[flow]=definition`.
- **Attributed revenue (the new bit):** `POST /api/campaign-values-reports/` and `POST /api/flow-values-reports/`. JSON:API body — `data.type='campaign-values-report'`, `data.attributes = { statistics: ['conversion_value','conversion_uniques','conversions'], timeframe: {start,end} | {key}, conversion_metric_id: <Placed Order id>, filter?: equals(campaign_id,"…") }`. `conversion_value` = attributed revenue; `conversion_uniques`/`conversions` = conversion counts. One report returns a row per campaign/flow in the timeframe — no per-entity fan-out.
- **Conversion metric id:** `GET /api/metrics/`, match the "Placed Order" metric (`equals(integration.name,…)` + `name=="Placed Order"`). Resolve once and cache (env var or cached lookup). `conversion_metric_id` is REQUIRED in the values-report body.
- **Email vs SMS split:** ✅ **VERIFIED (read-only probe, 2026-06-03)** — the default values-report already returns one row per campaign **message**, and each `results[].groupings` natively carries `send_channel` ("email"/"sms"), `campaign_id`, and `campaign_message_id`, alongside `results[].statistics` = `{ conversion_value, conversion_uniques, conversions }`. No `group_by` needed; the channel split is intrinsic to the rows.

**Rate limits (drive the caching design):** the values-report endpoints are heavily throttled — **Campaign Values Report = burst 1/s, steady 2/min, 225/day** (Metric Aggregates 3/s·60/min; Get Metrics 10/s·150/min). This rules out the FB tab's 2-minute auto-refresh for Klaviyo. **Design constraint:** the Klaviyo route caches values-report results server-side (short TTL, ~5–15 min) or persists a daily `KlaviyoInsightsDaily` snapshot (mirroring `MetaAdInsightsDaily`); the tab does NOT auto-refresh reporting data on an interval. The list endpoints (campaigns/flows) are not on the reporting tier and can be fetched more freely.

**Required key scopes:** `campaigns:read`, `flows:read`, `metrics:read`.

**Pre-build verification spike — ✅ DONE (read-only probe, 2026-06-03):**
- `KLAVIYO_PRIVATE_API_KEY` (dev key, `pk_…`) **has all three scopes** — `GET /metrics/`, `/campaigns/?filter=…`, `/flows/` all returned `200`.
- "Placed Order" `conversion_metric_id` = **`TaGfFU`** (integration: `API`), resolves **uniquely** by name → Part C resolves it at runtime via `GET /metrics/` (cached in-memory), no env var, account-agnostic.
- `POST /api/campaign-values-reports/` **works at the codebase's pinned `2025-10-15`** (and `2026-04-15`) — no revision bump needed.
- `groupings.send_channel` is native per row (see above).
- The reporting throttle is real (a 3rd rapid call returned `429`), confirming the cache/snapshot requirement.

**Effort:** M–L. **Risk:** de-risked by the spike; remaining work is mechanical (client methods + cache + tab). `flow-values-reports` assumed analogous to `campaign-values-reports` (verify its row shape with one probe during build).

---

## 7. Part A — True-ROAS Overview card

Pure frontend rewire of `AdvertisingPlatformCard.tsx` to read `stats.attributedRevenue[platform]` (revenue = `newRevenue`, `adSpend`, `trueRoas`) instead of pixel `spend × roas`. Klaviyo rows revenue-only. Full detail in the dedicated spec: [2026-06-02-advertising-true-roas-design.md](2026-06-02-advertising-true-roas-design.md). **No backend.** Ships first as the de-risking quick win that validates the data basis the rest depends on. **Effort:** S.

---

## 8. Part B — Per-platform hourly breakdown in each tab

Render SHARED-1 filtered to one platform inside each platform tab, modelled on Facebook's existing internal `HourlyBreakdownSection` (`FacebookAdsManagement.tsx:607/1514`).

- **Facebook tab:** revenue + conversions (SHARED-1, `convertingPlatform='meta'`) **+ hourly spend/ROAS** (FB API hourly spend already exists; account TZ = Sydney so bars align). Note: Meta's hourly breakdown cannot return conversions/revenue — those always come from PaymentEvents.
- **TikTok / Snapchat tabs (currently empty shells):** revenue + conversions hourly only; spend/ROAS show "awaiting spend sync". This gives those tabs their first real content.
- **Klaviyo tab:** revenue + conversions hourly for the `klaviyo_email`+`klaviyo_sms` slice (no spend — owned).

**Effort:** M (FB mostly done; the other three are tab wiring on SHARED-1). **Risk:** must filter by `convertingPlatform`, not `utm_source` (invariant #1).

---

## 9. Part C — New Klaviyo analytics tab

New admin tab via the 5 mechanical steps (adminTabs.ts entry under the Analytics group → `KlaviyoAnalyticsManagement` component → AdminPage import + switch-case + subtitle), gated by `facebookAds.view` (reuse decision; no new permission, no route-whitelist edit). New permission-gated route(s) under the existing `/api/admin/klaviyo/` namespace delegating to SHARED-2.

**UI (driven by the verified Klaviyo API):**
- **Campaigns** — listed per channel (email/sms), columns: name, status (Draft/Scheduled/Sending/Sent/Cancelled), `scheduled_at`, attributed **revenue** (`conversion_value`) + conversions from the campaign-values report. A **"Scheduled / about to send"** view filters `status='Scheduled'` + `scheduled_at` in the near future, sorted soonest-first.
- **Flows** — status (live/manual/draft) + `trigger_type`, attributed revenue + conversions from the flow-values report.
- **Email vs SMS** — split via `groupings.send_channel` (or per-channel reports per the spike fallback).
- **Hourly** — the SHARED-1 hour-of-day breakdown for the `klaviyo_email`+`klaviyo_sms` slice (revenue + conversions; owned channel — no spend/ROAS).

**Labeling (per marketing best-practice research):** Klaviyo-reported `conversion_value` is labeled **"Klaviyo-attributed"**; it will NOT match the server-side `convertingPlatform=klaviyo_email/sms` totals (different attribution windows/logic) — where both appear, label the gap. Never sum Klaviyo-attributed revenue into a blended ad-revenue total (double-counts vs first-party).

**Effort:** M–L. **Risks:** reporting rate limits (→ cached/snapshotted, no auto-refresh); message-channel revenue split unverified; two-domain doc-sync obligation (admin + tracking).

---

## 10. Part D — New All-Platforms aggregate tab

New admin tab (same 5 steps, `facebookAds.view`) consuming SHARED-3 + SHARED-1:
- Headline: **overall ROAS** + **contribution after ad spend** — both ad-effectiveness numbers (paid-channel acquisition revenue ÷ / − paid spend, recomputed from sums, mirroring Part A's blended basis); **total ad spend**; plus **total acquisition revenue** (all channels, renewals excluded) and **overall conversions** as context. **Renewals excluded entirely** — this tab measures ad effectiveness only; the Overview revenue card already covers all-source/total revenue.
- Overall **hour-of-day** breakdown (SHARED-1, all platforms; spend bars Facebook-only).
- Per-platform comparison row (spend / revenue / true ROAS / conversions), reusing the same presentation classes as Part A (paid+spend / awaiting-sync / owned).

**Effort:** S–M. **Risks:** ROAS-from-sums (invariant #3); must not imply multi-platform spend coverage that doesn't exist; late-refund mutability of historical totals.

---

## 11. Sequencing (phased, value-first)

| Phase | Ships | Depends on | Effort |
|---|---|---|---|
| 1 | **A** — true-ROAS overview card | — | S |
| 2 | **SHARED-1** + **B** — per-platform hourly in each tab | A (validated basis) | M + M |
| 3 | **SHARED-2** + **C** — Klaviyo tab | SHARED-2 spike | M-L + M-L |
| 4 | **SHARED-3** + **D** — All-Platforms tab | SHARED-1, SHARED-3 | S + S-M |

Each phase is an independently reviewable PR. Per the no-auto-commit rule, nothing is committed without your go-ahead.

## 12. Open verifications (account-level — cannot be derived from code)

- Klaviyo private key scopes `campaigns:read` / `flows:read` / `metrics:read`; "Placed Order" `conversion_metric_id` location (env vs runtime); pinned API `revision` supports the values-report endpoints; whether `groupings.send_channel` splits revenue. *(all block Phase 3; resolved by the SHARED-2 spike)*
- ~~FB ad account timezone~~ — confirmed Sydney.
- Whether the business holds TikTok/Snapchat Marketing API access — only relevant to the *deferred* spend-sync project, not this suite.

## 13. Non-goals (explicitly out of scope here)

- Building TikTok/Snapchat ad-spend sync (separate future project).
- Campaign-level ROAS for the ad platforms (attribution is platform-level; Meta campaign-level join not built).
- A persisted hourly rollup model (live aggregate is sufficient for hour-of-day across the selected range).
- Subtracting Stripe fees / prize costs / COGS (v1 contribution = revenue − ad spend only; deeper margin tiers layerable later).
- Multi-currency FX normalization (system is AUD-only; carried forward as a known assumption).
