# Facebook Ads Health — Design Spec

**Date:** 2026-05-26
**Status:** Approved by user, ready for plan
**Domain:** `tracking` (existing) + `admin` (existing) — no new domain
**Branch:** `feature/facebook-ads-breakdown`

## Background

The ads team's PDF review of Tools Australia's Facebook ad account (account `act_1115200520594316`) surfaced a recurring pattern: budget decisions are made too quickly, too aggressively, and on adsets still in the learning phase — which triggers Meta's algorithm to reset, causing campaigns that were working (e.g. Bid Cap, ROAS 1.05) to collapse after over-scaling (+73% → ROAS 0.42).

The team currently makes scaling decisions inside Meta Ads Manager without a unified view of (a) which adsets have exited Meta's learning phase, (b) which had recent significant edits, and (c) which are bleeding spend with no conversion signal. The existing `FacebookAdsManagement` admin tab shows campaign / adset / ad breakdowns but does not surface learning-phase status, recent edits, budget jumps, or a per-adset scaling recommendation.

This feature adds a third view to that tab — **Ads Health** — that gives the team a daily-pivot, verdict-driven monitoring view tied to Meta's published best practices (50 conversions per 7-day learning window, ≤20% budget changes are non-significant edits, etc.).

**On TikTok and Snapchat.** The repo has shell models (`TikTokAdInsightsDaily`, `SnapchatAdInsightsDaily`) but no sync services yet. When those platforms want a similar monitoring view, **they will get their own specs and their own implementations** — this spec is Facebook-specific. The conceptual framework documented here (verdict types, two-window principle, tooltip design, alert pattern) is reusable as a *template* for those future specs, but no shared abstraction code is pre-built. Each platform's API, learning-phase concept, edit-tracking mechanism, and objective taxonomy is different enough that pre-building a shared layer would be speculative engineering. We build what we know now, and document patterns clearly enough that future specs can decide on their own how to reuse or diverge.

## Goals

1. Give the ads team a single screen that answers "what should I act on today?" without leaving the admin.
2. Make every recommendation auditable — the team must be able to see exactly which rules fired and what the threshold was.
3. Tie verdicts to Meta-documented thresholds where possible, and label everything else clearly as tunable heuristics.
4. Avoid duplicating Meta Ads Manager. This is read-only; all actions happen via deep links to Meta.
5. Document the patterns clearly enough that a future TikTok or Snapchat spec can use this as a template — without us pre-building shared code we haven't justified.

## Non-goals

- Editing ads, pausing ads, or changing budgets directly. Read-only by design.
- Replacing the existing `ads` and `spend-by-url` views. New view sits alongside them.
- Ad-level TRUE ROAS in v1 (deferred to v2 — see TRUE ROAS section).
- Email / Slack / push notifications. v1 is in-tab only.
- Sparklines per row. The pivot table's heatmap cells are the trend visualisation.
- Shared platform abstractions. v1 is Facebook-specific. TikTok/Snapchat get their own specs.

## Verified facts (from research)

- **50 conversions / 7 days** to exit learning phase — Meta-documented ([about learning](https://www.facebook.com/business/help/112167992830700), [about learning limited](https://en-gb.facebook.com/business/help/269269737396981)). Meta anchors the window to "the week after your last significant edit", not a pure rolling 7-day window.
- **`last_significant_edit`** is a real Marketing API field with a documented list of what counts as significant: pause, optimization event change, audience/targeting change, creative change, bid strategy change, budget change (when magnitude is significant; community-cited threshold is >20%). Source: [significant edits](https://www.facebook.com/business/help/316478108955072), [last significant edit](https://www.facebook.com/business/help/942374239243867).
- **20% budget change is in Meta's "safe zone"** — Meta documents that ≤20% changes "isn't likely to" trigger re-learning. Larger changes may or may not, depending on magnitude.
- **Campaign objectives that can optimize for purchase**: only `OUTCOME_SALES` and `OUTCOME_APP_PROMOTION` (in-app purchases only). Everything else (`OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`) cannot reliably deliver web purchase conversions — this is the "Instagram Engagement campaign" pattern from the PDF.
- **Other thresholds (2x target CPA, 25% WoW ROAS drop, 72h post-edit wait)** are practitioner heuristics, not Meta-documented. Will be exposed as tunable settings, not hardcoded.

## Architecture

### Where it lives

Extends the existing [`FacebookAdsManagement.tsx`](src/components/admin/FacebookAdsManagement.tsx) component, which already supports two `viewMode` URL params (`ads`, `spend-by-url`). Adds a third: `health`. Reuses the existing date-range toolbar, mobile-slot pattern, and `MetricCard` primitives.

```
src/components/admin/FacebookAdsManagement.tsx
├── viewMode="ads"           (existing, untouched)
├── viewMode="spend-by-url"  (existing, untouched)
└── viewMode="health"        (NEW — this spec)
    ├── FacebookAdsHealthTopBar       (account-level TRUE ROAS card + alert banner)
    ├── FacebookAdsHealthFilters       (5 filters)
    ├── FacebookAdsHealthPivotTable    (daily pivot, heatmap, verdict tooltips)
    └── FacebookAdsHealthSettingsModal (tunable thresholds)
```

### Data flow

```
[Daily cron] /api/cron/sync-meta-spend-by-url  (existing, extended)
   │
   │ pulls per ad x day from Meta Graph API
   │ NEW: also pulls inline_link_clicks, learning_stage_info,
   │      last_significant_edit, daily_budget, objective
   ▼
[MetaAdInsightsDaily]  (existing schema, NEW columns)
   │
   ▼
[Verdict engine]  (src/services/facebook-ads-health/verdictEngine.ts)
   │
   │ applies tunable thresholds from FacebookAdsHealthSettings
   ▼
[/api/admin/facebook-ads/health/insights]  (NEW route)
   │
   ▼
[FacebookAdsHealthPivotTable]  (NEW component)
```

### Layering compliance

Per repo conventions in CLAUDE.md:
- New verdict engine logic → `src/services/facebook-ads-health/` (business logic)
- New route handlers → `src/app/api/admin/facebook-ads/health/**` (thin, delegates to service)
- New components → `src/components/admin/facebook-ads-health/**`
- New TanStack Query hook → `src/hooks/queries/admin/useFacebookAdsHealth.ts`

## Data model changes

### `MetaAdInsightsDaily` — add columns

```ts
linkClicks: { type: Number, required: true, default: 0 }   // inline_link_clicks from Meta API
adsetBudgetCents: { type: Number, default: null }          // daily_budget snapshot at sync time
campaignObjective: { type: String, default: null }         // OUTCOME_SALES, OUTCOME_ENGAGEMENT, etc.
learningStatus: { type: String, default: null }            // 'LEARNING' | 'SUCCESS' | 'FAIL' from learning_stage_info
lastSignificantEdit: { type: Date, default: null }         // from Meta's last_significant_edit field
```

Index addition: `{ adAccountId: 1, adsetId: 1, date: 1 }` — supports adset-level rollups for the new view. The existing unique index `{ adAccountId, date, adId }` is preserved.

### `PaymentEvent` — denormalize attribution

```ts
attributionAdId: { type: String, default: null, index: true }
attributionAdsetId: { type: String, default: null, index: true }
attributionCampaignId: { type: String, default: null, index: true }
```

Populated from Stripe metadata (`attr_ad_id`, `attr_adset_id`, `attr_campaign_id`) at PaymentEvent write time. Allows future ad-level TRUE ROAS aggregation without a Stripe round-trip.

Note: these fields are intentionally platform-neutral (an `ad_id` is just a string). If a future TikTok/Snapchat spec wants ad-level attribution, it reuses the same fields. No change needed when those platforms land.

**v1 use:** these fields are populated forward-only by v1 PaymentEvent writers. v1 does NOT use them for any displayed ROAS — that's v2 work. A backfill script is deferred until v2.

### New collection: `FacebookAdsHealthSnooze`

```ts
{
  userId: ObjectId,           // who snoozed
  adAccountId: string,
  adId: string,
  verdict: string,            // 'investigate' (cut snoozes not allowed)
  snoozeUntil: Date,          // typically now + 24h
  reason: string?,            // optional user note
  createdAt: Date,
}
```

Indexes: `{ userId: 1, adId: 1 }` unique. TTL index on `snoozeUntil` for auto-cleanup. Naming includes `FacebookAds` so a future TikTok spec creates its own `TikTokAdsHealthSnooze` collection without conflict.

### New collection: `FacebookAdsHealthSettings`

Single-document collection holding tunable thresholds.

```ts
{
  scope: 'global',                        // always 'global' in this collection
  breakevenRoas: number,                  // default 1.0
  targetCpaAud: number,                   // default 40
  zeroConvSpendMultiplier: number,        // default 2.0
  roasDropTriggerPct: number,             // default 25
  postEditWaitHours: number,              // default 72
  updatedBy: ObjectId,
  updatedAt: Date,
}
```

Lazy-init: the document is created with defaults on first GET if it doesn't exist. Read-once cached at request time; refreshed when modified via the settings modal.

## Cron extensions

The existing daily cron at `/api/cron/sync-meta-spend-by-url` (already at `maxDuration: 300` in vercel.json) extends to:

1. **Add `inline_link_clicks` to the Graph API `fields` parameter** in [`facebook-marketing.ts:143, :377, :449`](src/lib/facebook-marketing.ts). Single string change, no extra API call.
2. **Per ad account, after the bulk insights fetch**, make one additional Graph API call to `act_X/adsets?fields=id,daily_budget,lifetime_budget,learning_stage_info,last_significant_edit,campaign{objective}` for active adsets. One call per ad account, not per adset (Meta's adset list endpoint returns all in one paginated call).
3. **Upsert the new columns** alongside the existing per-ad-day rows. The adset metadata is denormalized onto each ad row for that adset (so the pivot table can read it without joins).

Estimated time: existing sync runs well under 60s for 8 days × current ad count. Adding the adset metadata call adds ~5–15s. Comfortably under the 300s budget.

**Graceful degradation:** if Meta's API doesn't return `learning_stage_info` or `last_significant_edit` (permission scope issue, deprecated field), the sync continues, the columns stay null on that day's rows, and the verdict engine falls back per the "missing-data fallback" rules in the engine section below.

## API routes

### `GET /api/admin/facebook-ads/health/insights` (NEW)

**Auth:** `facebookAds.view`

**Query params:**
- `startDate`, `endDate` — reporting window (ISO yyyy-mm-dd)
- `level` — `campaign` | `adset` | `ad`
- `verdict` — comma-separated `scale,hold,investigate,cut`
- `learningStatus` — comma-separated `Active,Learning,LearningLimited`
- `minSpend` — number (cents)
- `campaign` — comma-separated campaign IDs
- `search` — free-text on adset/ad name

**Response shape (excerpt):**

```ts
{
  rows: Array<{
    id: string;
    name: string;
    campaignId: string;
    campaignName: string;
    adsetId?: string;
    adsetName?: string;
    learningStatus: 'Active' | 'Learning' | 'LearningLimited' | 'Unknown';
    metaRawStatus: string;   // 'SUCCESS' | 'LEARNING' | 'FAIL' from Meta — debug/audit only
    daily: Array<{
      date: string;
      spendCents: number;
      conversions: number;
      revenueCents: number;
      linkClicks: number;
      impressions: number;
      linkCtr: number;          // linkClicks / impressions × 100
      costPerLinkClick: number; // spendCents / linkClicks
      roas: number;
    }>;
    window: { spendCents: number; conversions: number; revenueCents: number; ... };
    last7d: { conversions: number; roas: number; prev7dRoas: number | null };  // ALWAYS trailing-7 regardless of reporting window
    lastSignificantEdit: Date | null;
    lastBudgetChangePct: number | null;
    daysAtZero: number;
    verdict: 'scale' | 'hold' | 'investigate' | 'cut';
    verdictReasons: Array<{
      section: string;
      rule: string;
      source: 'meta' | 'tunable';
      passed: boolean | 'info';
      value: string;
    }>;
    metaAdsManagerUrl: string;
    snoozedUntil: Date | null;
  }>;
  alertCount: { investigate: number; cut: number };
  accountTrueRoas: { localRevenueAud: number; metaSpendAud: number; ratio: number };
}
```

### `POST /api/admin/facebook-ads/health/snooze` (NEW)

**Auth:** `facebookAds.view`

**Body:** `{ adId: string, verdict: 'investigate', hours: 24, reason?: string }`

Creates or updates a `FacebookAdsHealthSnooze` document for the requesting user. Hours capped at 24 server-side. `verdict` enum is restricted to `'investigate'` — Cut? snoozes return 400.

### `GET /api/admin/facebook-ads/health/settings` and `PUT` (NEW)

**Auth:** `facebookAds.view` for GET, `facebookAds.edit` for PUT.

Reads/writes the `FacebookAdsHealthSettings` singleton. Settings changes write to the existing `StaffActivity` audit collection.

### Vercel timeout

Add explicit override in `vercel.json`:

```json
"src/app/api/admin/facebook-ads/health/insights/route.ts": { "memory": 512, "maxDuration": 30 }
```

30s ceiling is conservative — the route reads from Mongo only (no live Meta calls) and the verdict engine is in-process. Real-world load expected to complete in 1–3 seconds.

## Verdict engine

All rules implemented in `src/services/facebook-ads-health/verdictEngine.ts`. Pure function:

```ts
function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettings,
): { verdict: 'scale' | 'hold' | 'investigate' | 'cut'; reasons: VerdictReason[] }
```

`MetaAdInsightsRow` is a Facebook-specific shape derived from `MetaAdInsightsDaily` aggregations. No platform-agnostic types — this spec is Facebook-only.

### Two-window principle

The verdict engine uses two independent date windows. Both are documented in the response shape and the user-facing tooltips:

- **Reporting window** — user-picked (today, yesterday, 3d, 7d, 14d, 28d, custom). Drives the pivot table's column count and the `daily[]`/`window` fields in the API response. The metric pill (Spend / Conv / Revenue / ROAS / Link Clicks / Link CTR / Cost per Link Click) determines what fills each daily cell.
- **Learning window** — fixed at trailing 7 days from "now", regardless of reporting window. Drives `last7d.conversions`, `last7d.roas`, and the learning-status calculation. Never user-configurable; Meta's algorithm uses 7 days as the learning threshold.

If the user picks a reporting window of 3 days, the pivot table shows 3 day-columns but the learning status badge and verdict still use trailing-7 data. The Verdict tooltip shows both windows clearly so the team understands what's being compared.

### Verdict definitions

**SCALE +20%** — all conditions must match:
- Meta `learningStatus` = `Active` (mapped from raw `SUCCESS`) **[META]**
- Conversions in trailing 7 days ≥ 50 **[META]**
- ROAS in trailing 7 days ≥ `settings.breakevenRoas` **[TUNABLE]**
- No significant edit in last `settings.postEditWaitHours` hours (default 72h, from `last_significant_edit`) **[META]**
- ROAS week-over-week change ≥ `-settings.roasDropTriggerPct`% (i.e. dropped less than 25%) **[TUNABLE]**

Action text: *"Raise daily budget by 20% (e.g. $X → $Y). Re-evaluate in `settings.postEditWaitHours` hours."*

**HOLD** — fires when no other verdict applies. Catch-all for "fine, just monitor." Trigger reason names the closest unmet condition (e.g. "1 short of 50 conv", "edited 4 days ago").

Action text: *"Do nothing. Re-check in 48 hours."*

**INVESTIGATE** — was healthy, recently broke. All required:
- "Was healthy" group, ALL: at least one 7d window in the last 14 days had ≥ 50 conversions AND ROAS ≥ `settings.breakevenRoas` **[META + TUNABLE]**
- "Now broken" group, ANY: trailing 7d ROAS dropped > `settings.roasDropTriggerPct`% week-over-week (with ≥ 50 conv in both compared weeks) OR Meta `learningStatus` reverted from `Active` to `Learning`/`LearningLimited` **[META + TUNABLE]**
- "Recent edit detected" group, ANY: `lastSignificantEdit` ≤ 7 days ago **[META]**

Action text: *"Open in Meta Ads Manager — review change log. Most likely fix: revert the recent edit back to its prior state. Do NOT pause — audience and creative were proven."*

**CUT?** — clearly broken, any of:
- Meta `learningStatus` = `LearningLimited` for ≥ 3 days AND window spend ≥ 5× `settings.targetCpaAud` **[META + TUNABLE]**
- Spend in trailing 7d ≥ `settings.zeroConvSpendMultiplier` × `settings.targetCpaAud` AND (conversions = 0 OR achieved CPA > 2× `settings.targetCpaAud`) **[TUNABLE]**
- Campaign `objective` NOT in (`OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`) **[META]**

Note: the 5× and 2× multipliers in rules 1 and 2 are hardcoded practitioner heuristics. Only `targetCpaAud` and `zeroConvSpendMultiplier` are user-exposed settings. We don't expose every coefficient — that's overengineering.

Action text: *"Pause this adset in Meta. Reallocate $X/wk to working adsets."*

### Statistical-confidence floor

For any week-over-week comparison (ROAS drop), require ≥ 50 conversions in both compared weeks. Below that, the WoW signal is suppressed and the rule shows as `info` (informational, not pass/fail) in the tooltip with the note "insufficient data — need ≥50 conv in both weeks."

### Missing-data fallback

If Meta's API didn't return one or more of the new fields (`learning_stage_info`, `last_significant_edit`, daily budget), the engine handles it gracefully:

- **Missing `learningStatus`**: badge shows `Unknown`. Scale and Investigate verdicts that depend on Active state degrade to Hold. Cut?'s "Learning Limited" rule simply doesn't fire — the spend/CPA rules still can.
- **Missing `lastSignificantEdit`**: edit-detection rules show as `info` ("can't determine"), not pass/fail. Scale's "no recent edit" requirement becomes a warning, not a blocker.
- **Missing `campaignObjective`**: the wrong-objective Cut? rule doesn't fire.

The engine never crashes on missing data; it surfaces the gap in the tooltip so the team knows why a verdict is less confident than usual.

## UI design

### Three placements

1. **Top bar** (`FacebookAdsHealthTopBar`)
   - Account-level TRUE ROAS metric card: *"Account TRUE ROAS: 0.53 · Meta-reported: 0.70 · Meta over-attributes by 32%"*.
   - **Implementation**: extract the comparison logic currently inside [`purchase-audit/route.ts`](src/app/api/admin/facebook-ads/purchase-audit/route.ts) into a service (`src/services/facebook-ads-health/accountTrueRoasService.ts`) that accepts an arbitrary date range. The existing `purchase-audit` route continues to work (delegates to the new service with its `today/7d/30d` enum). The new health insights endpoint also calls the service, passing the user's reporting window. Same logic, two callers.
   - Alert banner when alertCount > 0: *"3 adsets need attention. 2 Cut? · 1 Investigate. [Show only these]"*
   - Banner auto-clears when filtered scope has zero triggering verdicts.

2. **Filters row** (`FacebookAdsHealthFilters`)
   - Verdict (multi-select chips)
   - Learning status (multi-select chips)
   - Spend ≥ (number input, AUD)
   - Campaign (multi-select dropdown)
   - Search (text input)
   - Settings cog icon → opens `FacebookAdsHealthSettingsModal`
   - Export CSV button

3. **Pivot table** (`FacebookAdsHealthPivotTable`)
   - Columns: Adset name (sticky) + status badge | one column per day in reporting window | Total | Verdict chip | Open-in-Meta `↗`
   - Cells are heatmap-shaded per row (max value in row = darkest). Zero-conversion cells get red background and `!` marker.
   - Cells annotated where appropriate: if `lastBudgetChangePct` falls on a date column, that cell gets a small red baseline marker.
   - Verdict chip is hoverable — shows full tooltip (rules grouped by section, ✓/✗/· icons, `META`/`TUNABLE` source tags, "What to do next" actions with specific dollar amounts).
   - Bottom totals row: daily sums across all visible (post-filter) rows.

### Settings modal

Six controls:
- Breakeven ROAS (default 1.0)
- Target CPA (AUD, default 40)
- Zero-conv spend multiplier (default 2.0×)
- ROAS-drop trigger % (default 25)
- Post-edit wait window (hours, default 72)
- "Restore defaults" button

Saved via `PUT /api/admin/facebook-ads/health/settings`. Audited via existing `StaffActivity` model.

### Mobile / responsive

- **Desktop (lg+):** Full pivot table with sticky first column, horizontal scroll past ~10 day-columns.
- **Tablet (md):** Same as desktop, with the day columns scrolling horizontally; filters condense into a single "Filters" dropdown.
- **Mobile (sm):** Card layout — one card per adset. Card shows: name + status badge, 7 mini-heatmap day cells in a row, total + verdict chip, open-in-Meta. No filter bar; instead, a single "Verdict + Search" header.

All states respect light + dark theme via existing CSS variables. Heatmap palette: light mode uses blue-to-white scale; dark mode uses blue-to-charcoal. Zero cells stay red in both themes.

## Settings, permissions, security

- All routes gated by `requirePermission('facebookAds.view')` (read) or `facebookAds.edit` (write settings). No new permission entries needed.
- Mobile slot toolbar uses existing `useAdminMobileDateToolbarSlot` pattern.
- CSP: no inline scripts added. Component uses Tailwind and React event handlers (existing infra).
- Rate limiting: not added in v1; existing admin auth gating is sufficient. The route is read-only and the API doesn't hit Meta on the user's request path.
- Audit: settings changes write to the existing `StaffActivity` collection via the existing audit pattern. No new audit infra.

## Diagnostic / supporting scripts

Three new scripts under `scripts/`:

1. **`find-meta-utm-coverage.ts`** — one-off diagnostic. Reads last 60 days of `MetaAdDestination`, checks how many `rawUrls` entries contain `utm_content=`, prints a coverage percentage. Used to decide whether ad-level TRUE ROAS becomes viable in v2.
2. **`backfill-meta-link-clicks.ts`** — re-fetches historical `MetaAdInsightsDaily` rows from Meta's Graph API to populate the new `linkClicks` column. Standard backfill pattern; `--dry-run` flag.
3. **`backfill-meta-adset-metadata.ts`** — populates `adsetBudgetCents`, `campaignObjective`, `learningStatus`, `lastSignificantEdit` on historical rows where possible. Some historical metadata may not be retrievable from Meta retroactively; flag those rows.

All three follow the existing repo pattern (npm script in `package.json`, mongoose via `src/lib/mongodb.ts`, `--dry-run` flag, console.error for ad-hoc debug logging since production builds strip console.log).

## Documentation updates

Per the doc-sync hook and CLAUDE.md rules, these updates are required in the same change:

- `docs/tracking/` — extend existing docs to describe the new `MetaAdInsightsDaily` columns, the verdict engine service at `src/services/facebook-ads-health/`, and the new collections.
- `docs/admin/` — add a new section for the Facebook Ads Health view, including the verdict rules table, settings, and screenshots.
- `docs/auth/` — note that `FacebookAdsHealthSettings` PUT requires `facebookAds.edit`.

**Domain manifest updates** in [CLAUDE.md](CLAUDE.md):
- `tracking` domain `paths` must add `src/services/facebook-ads-health/**`.
- `admin` domain `paths` must add `src/components/admin/facebook-ads-health/**` and `src/app/api/admin/facebook-ads/health/**`.
- No new domain. The new code is a feature within tracking + admin.

## Testing

Per repo convention, tests live as standalone tsx scripts under `__tests__/`. New test files (each with its own `test:*` entry in `package.json`):

1. **`src/services/facebook-ads-health/__tests__/verdictEngine.test.ts`** — table-driven test covering all four verdicts with permutations from the PDF's real cases:
   - LTB-C → Scale (130 conv, ROAS 0.77, no recent edit)
   - BOF-Retargeting-49-conv → Hold (1 short of 50)
   - Bid Cap-D collapse → Investigate (was 91 conv at ROAS 1.05, dropped to 76 conv at ROAS 0.42 after +73% budget jump on May 21)
   - Ryobi-A → Cut? (4 conv at $238 CPA on $40 target, Learning Limited 8 days)
   - DeWalt-B → Cut? (13 conv, Learning Limited, +260% budget)
   - "Insufficient data" suppression (e.g. 20 conv vs 25 conv week-over-week — WoW signal suppressed)
2. **`src/services/facebook-ads-health/__tests__/twoWindow.test.ts`** — verifies that the learning window remains trailing-7 when the reporting window is 3d, 14d, or 28d.
3. **`src/services/facebook-ads-health/__tests__/missingData.test.ts`** — verifies graceful fallback when `learningStatus`, `lastSignificantEdit`, or `campaignObjective` are null.
4. **`src/app/api/admin/facebook-ads/health/__tests__/insights.test.ts`** — integration test for the insights route: auth gating, filter application, response shape.

No mocking of MongoDB per the repo's "no DB mocks in tests" convention. Tests connect to a test DB.

## Risks and open items

1. **UTM coverage unknown.** The diagnostic script will resolve this. If coverage is <80%, v2 ad-level TRUE ROAS requires the ads team to fix tagging first; we should not silently ship a half-attributing TRUE ROAS column.
2. **Meta API field availability.** `learning_stage_info` and `last_significant_edit` are documented but field-level access can require Marketing API permission scopes. If our access token doesn't return these fields, the verdict engine degrades per the "missing-data fallback" section above. Implementation must verify field availability early and surface a clear error if absent.
3. **Heatmap normalisation.** Per-row max highlights row trends but obscures cross-row comparison; global max would compare adsets but lose row trends. v1 ships per-row max with a toggle deferred to v2 if needed.
4. **Daily budget snapshot lag.** Snapshots taken once per cron run mean a budget changed at 10am AEST and reverted at 11am AEST might not be visible. Acceptable for v1; if it becomes a problem, we add intraday snapshots later.
5. **Snooze + verdict-change interaction.** If a snoozed Investigate flips to Hold (because the user reverted the edit), the snooze should evaporate, not linger. Implemented as: snooze applies only when current verdict equals the snoozed verdict.
6. **CSP impact.** None expected — no inline scripts. Will verify during implementation.

## v1 scope summary (what ships)

- New `viewMode=health` in `FacebookAdsManagement`
- Verdict engine and supporting services in `src/services/facebook-ads-health/` (verdictEngine, accountTrueRoasService, snoozeService, settingsService)
- UI components in `src/components/admin/facebook-ads-health/` (TopBar, Filters, PivotTable, SettingsModal)
- Five filters, daily pivot table, four-verdict engine with auditable tooltips, in-tab alert banner, 24h per-row Investigate snooze
- New metric pills: Spend / Conv / Revenue / ROAS / Link Clicks / Link CTR / Cost per Link Click
- Account-level TRUE ROAS card (Meta-reported vs local PaymentEvent reconciliation)
- Tunable settings (5 thresholds + breakeven ROAS) editable by `facebookAds.edit`
- Mobile card layout
- Three supporting scripts (diagnostic + 2 backfills)
- Tests for verdict engine, two-window logic, missing-data fallback, and the insights route

## Deferred to v2 (with reasoning)

- **Ad-level TRUE ROAS column** — depends on UTM coverage diagnostic. Plumbing prepared in v1 (PaymentEvent denormalised attribution fields populated forward-only).
- **Per-row sparkline** — heatmap row IS the sparkline visually. Add later if team asks.
- **Cross-tab notification badge / email / Slack alerts** — wait for evidence the in-tab banner isn't enough.
- **Global heatmap normalisation toggle** — ship per-row first.
- **Intraday budget snapshots** — daily is sufficient until proven otherwise.
- **Editing actions inside the view** — keep read-only by design.

## For future TikTok or Snapchat specs (informational)

When TikTok or Snapchat want a similar feature, they will:

1. Build their own ingestion services (writing to `TikTokAdInsightsDaily` / `SnapchatAdInsightsDaily`).
2. Author a new spec (`docs/superpowers/specs/<date>-tiktok-ads-health-design.md` etc.) using this one as a *template* — not a parent. They re-make the decisions, possibly differently:
   - Does the platform have a learning-phase concept? With what threshold?
   - Does it expose a `last_significant_edit`-equivalent?
   - Which campaign objectives are purchase-capable?
   - Does the platform's hierarchy fit campaign → adset → ad?
3. Build their own `src/services/<platform>-ads-health/` and `src/components/admin/<platform>-ads-health/` directories. They may copy patterns from the Facebook implementation, but no shared code is imposed.
4. Reuse the platform-neutral pieces that already exist: `PaymentEvent.attributionAdId/AdsetId/CampaignId` fields (already added in v1), shared admin primitives (`DateRangeToggle`, `MetricCard`), the audit pattern via `StaffActivity`.

We do not estimate effort, because we have not researched those platforms. Their specs are independent design exercises.

## References

### Meta / Facebook documentation (Meta-official)

- [About the Learning Phase — Meta Business Help Center](https://www.facebook.com/business/help/112167992830700) — defines the 50-events-per-7-days threshold
- [About Learning Limited — Meta Business Help Center](https://en-gb.facebook.com/business/help/269269737396981) — defines the `LearningLimited` state and the "around 50 optimisation events in the week after your last significant edit" language
- [Significant Edits and Learning Phase — Meta Business Help Center](https://www.facebook.com/business/help/316478108955072) — list of edits that reset learning; the "≤20% budget change isn't likely to" language
- [Last Significant Edit — Meta Business Help Center](https://www.facebook.com/business/help/942374239243867) — defines the `last_significant_edit` field
- [Meta Marketing API — Ad Set fields](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/) — `learning_stage_info`, `last_significant_edit`, `daily_budget`, `lifetime_budget` field reference
- [Meta Marketing API — Insights fields](https://developers.facebook.com/docs/marketing-api/reference/ads-insights/) — `inline_link_clicks`, `actions`, `action_values`, attribution windows
- [Campaign Objectives (ODAX) — Meta Business Help Center](https://www.facebook.com/business/help/1438417719786914) — the list of `OUTCOME_*` objectives and what each can optimise for

### Practitioner-heuristic sources (NOT Meta-official, used for tunable defaults)

- [When Should You Pause Underperforming Ads on Meta? — ROASPIG](https://roaspig.com/blog/pause-underperforming-ads-when) — origin of the "spend ≥ 2× target CPA with 0 conversions = pause" heuristic
- [Facebook Ad Automated Rules Cheat Sheet — Birch (Revealbot)](https://bir.ch/facebook-automated-rules) — origin of the same heuristic in a different form
- [Is the Learning Phase Changing? — Jon Loomer](https://www.jonloomer.com/qvt/is-the-learning-phase-changing/) — coverage of the 2024 temporary 10/3 test that Meta reverted

### Internal codebase references

- [CLAUDE.md](CLAUDE.md) — hard rules: no auto-commit, doc sync, no overengineering, verify before claiming, subagent scope discipline
- [src/lib/permissions.ts](src/lib/permissions.ts) — RBAC area/action model (`facebookAds.view`, `facebookAds.edit`)
- [src/lib/api-auth-permissions.ts](src/lib/api-auth-permissions.ts) — `requirePermission` gating used by every new route
- [src/components/admin/FacebookAdsManagement.tsx](src/components/admin/FacebookAdsManagement.tsx) — host component, gets a third `viewMode`
- [src/lib/facebook-marketing.ts](src/lib/facebook-marketing.ts) — Graph API client, gets `inline_link_clicks` field added
- [src/models/MetaAdInsightsDaily.ts](src/models/MetaAdInsightsDaily.ts) — base schema, gets 5 new columns
- [src/models/MetaAdDestination.ts](src/models/MetaAdDestination.ts) — preserves raw URLs (with UTMs) per ad
- [src/models/TikTokAdInsightsDaily.ts](src/models/TikTokAdInsightsDaily.ts) — shell model for future TikTok integration (not touched in v1)
- [src/models/SnapchatAdInsightsDaily.ts](src/models/SnapchatAdInsightsDaily.ts) — shell model for future Snapchat integration (not touched in v1)
- [src/models/PaymentEvent.ts](src/models/PaymentEvent.ts) — gets denormalised `attributionAdId/AdsetId/CampaignId` fields (platform-neutral)
- [src/lib/utm/meta-ads-utm.ts](src/lib/utm/meta-ads-utm.ts) — the documented UTM template for Meta ads
- [src/utils/tracking/attribution-schema.ts](src/utils/tracking/attribution-schema.ts) — Zod schema for attribution params on inbound requests
- [src/utils/tracking/attribution-metadata.ts](src/utils/tracking/attribution-metadata.ts) — Stripe-metadata writer (`attr_*` keys)
- [src/app/api/admin/facebook-ads/purchase-audit/route.ts](src/app/api/admin/facebook-ads/purchase-audit/route.ts) — existing account-level reconciliation logic that gets extracted to a service
- [src/services/meta/MetaInsightsSyncService.ts](src/services/meta/MetaInsightsSyncService.ts) — the existing sync service that gets the field-list extension
- [vercel.json](vercel.json) — function timeout overrides; new route gets `maxDuration: 30`
- [docs/PAYMENT_ATTRIBUTION.md](docs/PAYMENT_ATTRIBUTION.md) — existing docs on how attribution flows from landing → Stripe metadata
- [docs/MONGODB_CONNECTION_BEST_PRACTICES.md](docs/MONGODB_CONNECTION_BEST_PRACTICES.md) — use `src/lib/mongodb.ts`, no ad-hoc connections
- [docs/UTM_ATTRIBUTION.md](docs/UTM_ATTRIBUTION.md) — UTM capture pipeline documentation

### Shared admin UI primitives reused

- [src/components/admin/DateRangeToggle.tsx](src/components/admin/DateRangeToggle.tsx) — date range picker pattern
- [src/components/admin/CustomDateRangeModal.tsx](src/components/admin/CustomDateRangeModal.tsx) — custom range modal
- [src/app/admin/component/AdminMobileLayoutDateRangeShell.tsx](src/app/admin/component/AdminMobileLayoutDateRangeShell.tsx) — mobile date toolbar shell
- [src/hooks/useAdminMobileDateToolbarSlot.ts](src/hooks/useAdminMobileDateToolbarSlot.ts) — mobile slot pattern
- [src/components/admin/metrics/shared/MetricCard.tsx](src/components/admin/metrics/shared/MetricCard.tsx) — TRUE ROAS card uses this
- [src/components/modals/ui/Dropdown.tsx](src/components/modals/ui/Dropdown.tsx), [Checkbox.tsx](src/components/modals/ui/Checkbox.tsx) — filter UI primitives

### Skills / tools used in producing this spec

- `superpowers:brainstorming` — interactive design loop
- `superpowers:writing-plans` — to be invoked next, will translate this spec into a phased implementation plan
- `superpowers:verification-before-completion` — to be applied at implementation time
- Codebase investigation pass via `codebase-investigator` agent — initial architecture mapping
- Two `general-purpose` agent research passes — verified Meta docs on learning phase, 20% rule, last_significant_edit, campaign objectives, and statistical-confidence floors

### Source of requirements

The PDF "Tools Australia — OpenClaw Conversation Log · Facebook Ads Review" (compiled 2026-05-25, prepared for Derem Joshua) — the audit document that surfaced the over-scaling pattern, the wrong-objective Instagram Engagement campaign, the Bid Cap collapse story, and the team's standing rule to compute TRUE ROAS rather than rely on Meta's `website_purchase_roas`. Not committed to the repo; kept by the user.
