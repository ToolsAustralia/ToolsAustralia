# Phase 3 — SHARED-2 (Klaviyo reporting client) + Part C (Klaviyo tab) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.
> **No-auto-commit:** commit per-phase under the user's standing authorization; else stage + ask.

**Goal:** A new admin **Klaviyo** analytics tab showing (balanced layout): a "scheduled / about to send" strip on top, Campaigns + Flows revenue tables ranked by **Klaviyo-attributed** revenue (email vs SMS split) in the middle, and the server-side Klaviyo hourly revenue (SHARED-1) at the bottom. Backed by a new Klaviyo reporting client (SHARED-2) that reuses the existing `klaviyo` singleton's auth/revision/backoff.

**Verified API contract (read-only probe, 2026-06-03 — all confirmed):**
- Scopes `campaigns:read` / `flows:read` / `metrics:read` are granted on `KLAVIYO_PRIVATE_API_KEY`.
- "Placed Order" metric resolves uniquely by name → id `TaGfFU` (integration `API`). **Resolve at runtime + cache** (account-agnostic), do NOT hardcode.
- `POST /api/campaign-values-reports/` works at the pinned `revision: 2025-10-15`. Body: `{ data: { type: "campaign-values-report", attributes: { statistics: ["conversion_value","conversion_uniques","conversions"], timeframe: { key: "last_30_days" } | { start, end }, conversion_metric_id } } }`.
- Response: `data.attributes.results[]`, each `{ groupings: { send_channel, campaign_id, campaign_message_id }, statistics: { conversion_value, conversion_uniques, conversions } }`. **`send_channel` (email/sms) is native per row** — no `group_by` needed.
- `flow-values-reports` assumed analogous (`flow_id`/`flow_message_id`) — **verify its row shape with one probe in Task 1**.
- Reporting throttle is real (2/min) → **cache server-side** (a short-TTL in-memory cache; do NOT auto-refresh on an interval like the FB tab).

**Permission:** reuse `facebookAds.view` (decided). New tab id `klaviyo` under the Analytics group.

---

## Architecture / file structure

- **Minimal change to `src/lib/klaviyo.ts`** (tracking domain): add ONE public passthrough on `KlaviyoClient` — `async reportingRequest<T>(endpoint, method, body?): Promise<T>` = `retryRequest(() => makeRequest(...)).then(r => r.json())`. Keeps auth/revision/backoff reuse without moving private internals.
- **New `src/services/klaviyo-analytics/klaviyoReporting.ts`** (NEW domain `klaviyo-analytics` OR fold under tracking — decide in Task 0): the reporting logic — `resolvePlacedOrderMetricId()` (cached), `listCampaigns({channel,status})`, `listFlows()`, `getCampaignValues(metricId, timeframe)`, `getFlowValues(metricId, timeframe)`, plus pure shapers that fold `results[]` into per-campaign/flow rows with email/SMS split. Pure shapers are unit-tested.
- **New route(s) under `src/app/api/admin/klaviyo/`** (admin domain): `GET /api/admin/klaviyo/analytics?range=` → returns `{ scheduled, campaigns, flows }` (server caches the values-reports). Gated `requirePermission("facebookAds.view")`.
- **New `src/components/admin/KlaviyoAnalyticsManagement.tsx`** (admin domain) + the tab wiring (adminTabs.ts entry, AdminPage import + switch-case + subtitle). Consumes a `useKlaviyoAnalytics` hook + `useHourlyRevenue({platform:"klaviyo"})` (SHARED-1, already built).
- Manifest: add a `klaviyo-analytics` domain (or extend `tracking`) for the new service path — **registering-new-domain** if new.

---

## Task 0: Decide domain + scaffold

- [ ] Decide: new manifest domain `klaviyo-analytics` (service + route + component) vs. spread across `tracking` (klaviyo lib) + `admin` (route/tab). RECOMMEND: keep the lib change in `tracking`, the route + tab + service under `admin` (the service is admin-analytics, not marketing send). Add `src/services/klaviyo-analytics/**` to the `admin` domain `paths` in both root + worktree CLAUDE.md manifests.
- [ ] Add tab `{ id: "klaviyo", label: "Klaviyo", icon: <lucide>, requires: "facebookAds.view" }` to the Analytics group in `adminTabs.ts`; import + switch-case + subtitle in `AdminPage.tsx`.

## Task 1: SHARED-2 — Klaviyo reporting client (TDD on pure shapers)

- [ ] **Probe-verify `flow-values-reports`** row shape (one read-only call) before coding the flow path.
- [ ] Add `reportingRequest` passthrough to `KlaviyoClient` (`src/lib/klaviyo.ts`).
- [ ] Create `src/services/klaviyo-analytics/klaviyoReporting.ts`:
  - `resolvePlacedOrderMetricId()` — `GET /metrics/`, find `attributes.name === "Placed Order"`, cache the id in a module-level variable (resolve once per process). Throw a clear error if 0 or >1 matches.
  - `listCampaigns(channel: "email"|"sms")` — `GET /campaigns/?filter=and(equals(messages.channel,'<channel>'),...)&sort=-scheduled_at&include=campaign-messages` (follow `links.next`, cap pages). Map to `{ id, name, status, scheduledAt, channel }`.
  - `listScheduledCampaigns(channel)` — filter `equals(status,'Scheduled')` + `greater-or-equal(scheduled_at, now)`, `sort=scheduled_at`.
  - `listFlows()` — `GET /flows/?include=...`, map `{ id, name, status, triggerType }`.
  - `getCampaignValues(metricId, timeframe)` / `getFlowValues(metricId, timeframe)` — POST the values-report; return `results[]`.
  - **Pure shaper** `foldValuesByEntity(results, idKey)` → `Map<entityId, { email: {revenue,conversions}, sms: {...}, total: {...} }>` using `groupings.send_channel` + `groupings[idKey]`. **Unit-test this** (`test:klaviyo-reporting-shaper`) with a fixture mirroring the probe's `results[]` shape (no network).
- [ ] Join: campaigns/flows list (names/status) + folded values (revenue/conversions by channel) → ranked rows.

## Task 2: Route + caching

- [ ] `GET /api/admin/klaviyo/analytics?range=last_30_days` (gated). Resolves metric id, fetches scheduled + campaigns + flows + values, returns `{ scheduled: [...], campaigns: [...], flows: [...], range }`. **Server-side short-TTL cache** (e.g. a module Map keyed by range, 10-min TTL) so repeat loads don't hit the 2/min reporting throttle. On 429, return last-cached + a `stale: true` flag (graceful).
- [ ] Zod-validate `range`; `force-dynamic` + `nodejs` runtime; `console.error` on failure.

## Task 3: Part C — the Klaviyo tab (balanced layout)

- [ ] `useKlaviyoAnalytics(range)` hook (`src/hooks/queries/admin/`) — long `staleTime` (e.g. 10 min), **no `refetchInterval`** (respect the throttle).
- [ ] `KlaviyoAnalyticsManagement.tsx`:
  - **Top:** "Scheduled / about to send" strip — upcoming Scheduled campaigns (name, channel chip, `scheduledAt`) + live Flows. Compact cards/list.
  - **Middle:** two `DataTable`s — **Campaigns** and **Flows**, ranked by attributed revenue desc; columns: name, status, **Email rev**, **SMS rev**, **Total rev**, conversions. Label revenue "Klaviyo-attributed".
  - **Bottom:** `PlatformHourlyRevenueSection`-style hourly via `useHourlyRevenue({ platform: "klaviyo" })` (server-side klaviyo_email+sms) — note it differs from Klaviyo's own attribution (label both).
  - Loading/empty/`stale` states.

## Task 4: Docs + verify + diff review + commit

- [ ] Docs: `docs/admin/` (new tab + route + service), `docs/tracking/` (klaviyo.ts `reportingRequest`), `docs/client-state/` (`useKlaviyoAnalytics`), manifest entry. README/BUSINESS only if a "coming soon" flips (the Klaviyo insights tab may be a roadmap item — check).
- [ ] `npm run type-check` + lint clean; `npm run test:klaviyo-reporting-shaper` PASS.
- [ ] Optional: a live read-only smoke (probe) of the new route's service against the dev key.
- [ ] Fresh-eyes diff review.
- [ ] Commit per-phase: SHARED-2 client + Part C tab.

## Notes / gotchas

- **Hybrid attribution (decided):** the tab shows **Klaviyo-reported** `conversion_value` per campaign/flow; it will NOT equal the server-side `convertingPlatform=klaviyo_*` totals used on the overview card + aggregate tab — label the difference; never sum Klaviyo-attributed into a blended ad total.
- **Throttle:** never auto-refresh the reporting data; cache server-side + manual refresh only.
- **Metric id resolved at runtime** (`TaGfFU` today) — do not hardcode; the resolver keeps it account-agnostic.
- **`campaign_id === campaign_message_id`** in the probe sample (single-message campaigns) — don't assume they differ; key the fold on `campaign_id`.
