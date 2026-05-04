# Age Analytics + Profession Breakdown Cleanup — Design

**Date:** 2026-05-04
**Branch:** `claude/stripe-allowlist`
**Status:** Ready for implementation
**Domains touched:** `metrics-analytics`, `admin`

## Goal

Add an **Age Group Breakdown** chart to the admin User Metrics view and **clean up the existing Profession Breakdown** so free-text variants (typos, casing, plurals, Aussie trade nicknames) merge into canonical buckets.

Both ship in one pass to a section the user already calls "Users & Performance" — i.e. the metrics-mode toggle inside `UsersManagement`.

## Why

- **Age**: We collect `birthdate` at signup but never surface it. Demographic insight is currently invisible to admins. The data is already there; this is pure aggregation.
- **Profession**: The signup modal lets users free-text a profession (the "Other" option, 100-char field). The current chart treats `Electrician`, `electrician`, `sparky`, `Sparky `, and `electrcian` as five separate bars. Real signal is buried in noise.

## Non-goals (explicitly out of scope)

- Age × revenue cross-cut, age × lifecycle cross-cut. Easy follow-ups; deferred.
- Persisting a normalized profession on the `User` document. Stays read-time for now.
- Filtering the users-list by normalized profession.
- Age/profession comparison across major draws (the existing `UserMajorDrawComparisonService` keeps its current shape).
- Schema/migration changes. Zero DB writes.

## Architecture

**Approach: read-time aggregation in the existing service** (Option 1 of the brainstorm).

- Two pure utilities under `src/utils/metrics/` — testable, framework-free.
- One new chart component mirroring `ProfessionBreakdown.tsx` exactly.
- Edits to the existing service, type, and view — no new endpoints, no new domains.

The metrics service already loads the full user list per range for other aggregates, so age + profession normalization adds zero DB cost — pure in-memory work over the same iteration.

## File map

### New files

| Path | Purpose |
|------|---------|
| `src/utils/metrics/age-grouping.ts` | `getAgeGroup(birthdate, asOf?)`, `AGE_GROUP_ORDER`, `AgeGroupLabel` type |
| `src/utils/metrics/profession-normalize.ts` | `normalizeProfession(raw)`, `bucketUnmatched(counts, topN)`, `PROFESSION_SYNONYMS` map |
| `src/components/admin/metrics/users/AgeBreakdown.tsx` | Recharts bar chart, mirrors `ProfessionBreakdown.tsx` |
| `src/utils/metrics/__tests__/age-grouping.test.ts` | tsx test, wired as `npm run test:age-grouping` |
| `src/utils/metrics/__tests__/profession-normalize.test.ts` | tsx test, wired as `npm run test:profession-normalize` |

### Modified files

| Path | Change |
|------|--------|
| `src/types/metrics/UserMetrics.ts` | Add `ageGroup: Record<AgeGroupLabel, number>` to `UserMetrics` |
| `src/services/metrics/UserMetricsService.ts` | Select `birthdate` from User query; compute age groups; route raw profession through `normalizeProfession` then `bucketUnmatched(top5)` |
| `src/components/admin/metrics/UserMetricsView.tsx` | Render `<AgeBreakdown>` between Row 1 (Signup/Lifecycle) and the Profession row |
| `package.json` | Add two `test:*` scripts |

### Untouched

`src/components/admin/metrics/users/ProfessionBreakdown.tsx` — data already arrives normalized; existing styling carries through.

## Age grouping spec

`getAgeGroup(birthdate: Date | null | undefined, asOf: Date = new Date()): AgeGroupLabel`

- Compute age via the calendar method (year delta, decremented if month/day before `asOf`'s month/day) — **not** millisecond division (drifts on leap years).
- `birthdate` missing → `"Unknown"`.
- `birthdate` in the future → `"Unknown"` (defensive; the User schema already rejects this).
- Age `< 18` → `"Unknown"` (signup floor is 18; below is dirty data).
- Age ≥ 18 → bucket per the table below.

**Buckets and `AGE_GROUP_ORDER`** (chart renders left-to-right in this order regardless of object key insertion):

```
"18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown"
```

**`asOf` semantics**: default is "now", not the metrics date range's end. We surface the *current* demographic of the cohort created in the range, not their age-at-signup. A user who joined at 22 in 2024 and is 25 today shows in `25-34`.

## Profession normalization spec

`normalizeProfession(raw: string | undefined | null): string` runs in order:

1. **Sanitize** — trim, collapse internal whitespace, strip trailing punctuation, lowercase for matching. Empty result → `"Unknown"`.
2. **Synonym map** (lowercase keys → canonical from `src/data/professions.ts`):

   | Synonym(s) | Canonical |
   |---|---|
   | `sparky`, `sparkie`, `electric`, `electrcian`, `elec` | Electrician |
   | `chippy`, `chippie`, `carpenter`, `carpentry` | Builder |
   | `plumber`, `plumbing`, `plumb` | Plumber |
   | `builder`, `builders`, `construction worker`, `tradie`, `tradesman` | Builder |
   | `mechanic`, `mechanics`, `mech`, `motor mechanic`, `auto mechanic` | Mechanic |
   | `landscaper`, `landscaping`, `gardener`, `gardening` | Landscaper |
   | `welder`, `welding`, `welda` | Welder |
   | `bricklayer`, `bricky`, `brickie`, `brick layer` | Bricklayer |
   | `concreter`, `concretor`, `concrete`, `concreting` | Concreter |
   | `fitter`, `turner`, `fitter and turner`, `fitter & turner` | Fitter & Turner |
   | `painter`, `painting`, `painter & decorator` | Painter |
   | `construction`, `constructor` | Construction |

3. **Canonical match** — case-insensitive match against `PROFESSIONS` values. Strip a trailing `s` and re-check (covers `Builders` → `Builder`).
4. **Fallback** — title-case the sanitized input and return as-is. This becomes a long-tail entry (counted separately, may roll into `"Other (custom)"`).

`bucketUnmatched(counts: Record<string, number>, topN: number = 5): Record<string, number>`:

- Partitions `counts` into canonical (in `PROFESSIONS`) vs. unmatched.
- Sorts unmatched by count desc; keeps top `topN` as their own keys; sums the rest into `"Other (custom)"`.
- `"Other"` from the dropdown stays a distinct bar — labelled `"Other (custom)"` for the rolled-up bucket avoids the collision.

**Worst-case bar count**: 11 canonical + 5 top-unmatched + 1 `Other (custom)` = 17 bars (vs. unbounded today). `ProfessionBreakdown.tsx`'s existing `.slice(0, 10)` cap will be lifted to 20 (with a comment) so all normalized buckets surface; the bar count is bounded by `bucketUnmatched`, so a hard slice at the chart layer is no longer needed but kept as a defensive ceiling.

## Service changes — `UserMetricsService.getUserMetrics`

1. Add `birthdate` to the `.select()` projection on the existing User query.
2. After the existing user loop:
   ```ts
   ageGroup[getAgeGroup(user.birthdate)]++;
   ```
   Initialize the object from `AGE_GROUP_ORDER` so every bucket key exists with `0`.
3. Replace the raw `profession[user.profession]++` increment with:
   ```ts
   const normalized = normalizeProfession(user.profession);
   profession[normalized] = (profession[normalized] || 0) + 1;
   ```
4. After the loop, run `profession = bucketUnmatched(profession, 5)`.

## Type changes — `src/types/metrics/UserMetrics.ts`

```ts
export type AgeGroupLabel =
  | "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+" | "Unknown";

export interface UserMetrics {
  // ...existing fields...
  ageGroup: Record<AgeGroupLabel, number>;
}
```

`UserMetricsQuery` and `UserMetricsResponse` unchanged.

## UI — `UserMetricsView.tsx` chart layout

```
Row 1: [ SignupSourceChart  |  MembershipLifecycleChart ]   (existing, 2-col)
Row 2: [        AgeBreakdown (full-width, 280px)        ]   (NEW)
Row 3: [     ProfessionBreakdown (full-width, 400px)    ]   (existing)
```

`AgeBreakdown.tsx` mirrors `ProfessionBreakdown.tsx`:
- Same card chrome, dark-mode treatment, Recharts `BarChart`, red `#ef4444` fill.
- Title: **"Age Group Breakdown"**.
- X axis renders bars in `AGE_GROUP_ORDER` (chronological — not sorted by count). No label rotation (labels are short).
- Custom tooltip shows `Users: N (X.X%)` — small UX bump for demographic data.
- Empty state: "No age data available" if every count is 0.
- Height 280px (vs. 400px for Profession) — only 7 bars; reads better short.

## Tests

Both as standalone `tsx` scripts under `src/utils/metrics/__tests__/`, wired into `package.json`:

`test:age-grouping` covers:
- Each bucket boundary (24→24-bucket, 25→25-34, 64→55-64, 65→65+).
- `birthdate` null → `Unknown`.
- `birthdate` in future → `Unknown`.
- Age <18 → `Unknown`.
- Leap-year birthday on/just-after Feb 29 (calendar-method correctness).
- `asOf` parameter override (deterministic test fixtures).

`test:profession-normalize` covers:
- Each synonym maps to its canonical.
- Whitespace and case insensitivity (`"  ELECTRICIAN  "` → `Electrician`).
- Plurals (`"Builders"` → `Builder`).
- Common typo (`"electrcian"` → `Electrician`).
- Empty / null / whitespace → `Unknown`.
- `Other` (canonical, from dropdown) vs `Other (custom)` (rolled-up bucket) stay distinct in `bucketUnmatched`.
- `bucketUnmatched` with `topN=5`: top 5 unmatched survive as own keys; rest sum to `Other (custom)`; canonical entries pass through unchanged.

## Domain manifest impact

None. All new files fall under existing domain path globs:

| File | Domain |
|------|--------|
| `src/utils/metrics/**` | `metrics-analytics` |
| `src/types/metrics/**` | `metrics-analytics` |
| `src/services/metrics/**` | `metrics-analytics` |
| `src/components/admin/**` | `admin` |

**Docs to update at finishing-task time** (the `Stop` hook will enforce):
- `docs/metrics-analytics/` — note the new `ageGroup` field on `UserMetrics`, document the two new utils and the normalization rules.
- `docs/admin/` — note the new `AgeBreakdown` chart in the User Metrics chart view.

## API impact

`/api/admin/metrics/users` returns the new `ageGroup` field. Additive only — no breaking change for any existing consumer.

## Risks and trade-offs

- **Normalization is opinionated.** The synonym map is a judgment call. We commit it as data so it's easy to extend; the test suite documents the contract. If a synonym proves wrong, edit the map and rerun the test.
- **Read-time work scales with user-count-per-range.** For a metrics range covering ~all users, this is O(n) extra in-memory work over the existing loop — not a new query. If the User collection grows past, say, 250k, we promote to Option 2 (persisted normalization).
- **Dirty `birthdate` data.** Anyone with `birthdate < 18-years-ago` falls into `Unknown` rather than skewing the chart — the choice is deliberate but means the `Unknown` bar will include both "no birthdate" and "implausible birthdate". Acceptable for v1; admins can drill into raw data if needed.
