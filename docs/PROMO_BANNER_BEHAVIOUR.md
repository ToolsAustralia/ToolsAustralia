# Promo Banner Behaviour

This document describes how the PromoBanner component behaves: what it displays, in what order, and under which conditions. All times use **Australia/Sydney (AEST/AEDT)**.

---

## Banner Layout

The banner has three main areas:

| Area | Description | Examples |
|------|-------------|----------|
| **Badge** (gold pill) | First line, inside the gold gradient pill | DRAWN TONIGHT, BIG BONUS, BONUS ENTRIES |
| **Main line** | Second line, below the badge | GET 10X ENTRIES, JOIN NOW |
| **Right side** | Draw date, countdown, or static label | PROMO ENDING, 05 23 42 (HRS MINS SECS), DRAWN TOMORROW 5:30 PM |

---

## Definitions

| Term | Meaning |
|------|---------|
| **Scheduled promo** | Promo with a defined start/end date (`source: "scheduled"`, `scheduledEndDate`) |
| **Variant override** | Values from `variantConfig.banner` (badgeText, countdownLabel, etc.) — used for split testing |
| **Static urgency** | Label-only display (e.g. PROMO ENDING), no countdown tiles |
| **Freeze time** | Time when entries close for the draw (`currentDraw.freezeEntriesAt`) |
| **Effective promo** | Resolved promo for current tab from `useEffectiveForBanner` |

---

## Global Precedence Rules

1. **Draw status always wins.** When the draw is today or tomorrow, draw-based messaging takes precedence over everything — badge and right side. Variant overrides do *not* override DRAWN TONIGHT or DRAWN TOMORROW.

2. **Variant overrides apply only when the draw is not today or tomorrow.** They override scheduled-promo defaults (BIG BONUS, ENDS TONIGHT, PROMO ENDING) but never draw-based messaging.

3. **Edge case: draw today + scheduled promo &lt;24h** — Draw wins. Badge shows DRAWN TONIGHT, right side shows countdown to freeze time. Scheduled promo messaging is ignored.

---

## 1. Badge Text (Gold Pill)

**Priority order:**

| Priority | Condition | Badge Text |
|----------|-----------|------------|
| 1 | No promo active | `BONUS ENTRIES` |
| 2 | Draw is **today** | `DRAWN TONIGHT` |
| 3 | Draw is **tomorrow** | `DRAWN TOMORROW` |
| 4 | **Variant override** (split test) | `variantConfig.banner.badgeText` |
| 5 | Scheduled promo active, **≥24h** left | `BIG BONUS` |
| 6 | Scheduled promo active, **<24h** left | `ENDS TONIGHT` |
| 7 | 10× multiplier | `BIGGEST BONUS` |
| 8 | Active scheduled text | Admin-configured text |
| 9 | Default | Alternating default (e.g. `BONUS ENTRIES`) |

Variant override runs before scheduled promo defaults so split tests can test different badge text for scheduled-promo users. **Variant does not override draw-based badges** (DRAWN TONIGHT, DRAWN TOMORROW).

**Draw status** is based on the draw’s **calendar date** in AEST, not hours remaining:
- **Today** = draw date is same as current date
- **Tomorrow** = draw date is next calendar day
- **Else** = draw is 2+ days away

---

## 2. Main Line (Second Line)

| Condition | Main Line |
|-----------|-----------|
| No promo | `JOIN NOW` |
| Active promo | `GET {multiplier}X ENTRIES` (e.g. `GET 10X ENTRIES`) |

---

## 3. Right Side (Countdown / Label)

Right-side content is driven by `countdownDisplay.type` and overrides. **Draw status is checked first**; if the draw is today or tomorrow, that content takes precedence.

### 3.1 No Promo

| Display |
|---------|
| `NEXT DRAW` (static label) |

### 3.2 Draw Status Priority (today / tomorrow)

| Draw Status | Right Side Display |
|-------------|--------------------|
| **Today** | Countdown to **freeze time** (HRS MINS SECS tiles) — when entries close |
| **Tomorrow** | Static text: `DRAWN TOMORROW` + draw time (e.g. `5:30 PM AEDT`) |

**When draw is today or tomorrow, draw messaging always wins** — even if a scheduled promo is also active (e.g. draw today + promo &lt;24h). Badge and right side both show draw content; scheduled promo is ignored.

**Note:** When the draw is tomorrow, the right side shows static text only, **no countdown**. A countdown appears only on the day of the draw (draw tonight).

### 3.3 Scheduled Promo (default behaviour)

When there is an active **scheduled promo**, the right side shows the **24hr countdown to next midnight AEST** (default; refreshes every midnight), not the countdown to promo end or static "PROMO ENDING".

| Condition | Right Side Display |
|-----------|--------------------|
| Scheduled promo active | 24hr countdown to next midnight (HRS MINS SECS) |

This block is **skipped** when the draw is today or tomorrow so that draw content is shown instead.

### 3.4 Other Countdown Display Types

| Type | When | Right Side Display |
|------|------|--------------------|
| `static_urgency` | No scheduled promo, static mode | Static label (e.g. LIMITED TIME ONLY, PROMO ENDING, ENDING SOON) |
| `scheduled_end` | Variant `countdownMode: "scheduled_end"` + scheduled promo | Countdown to promo end (DAYS HRS MINS or HRS MINS SECS) |
| `midnight` | Default: scheduled promo or fallback | 24hr countdown to next midnight AEST (HRS MINS SECS, refreshes at midnight) |

### 3.5 Countdown Tile Formats

- **HRS/MINS/SECS format** (used when &lt;24h for scheduled promo, or for freeze/midnight): Hours may exceed 24 (e.g. 25 HRS 30 MINS 00 SECS).
- **DAYS/HRS/MINS format** (used when ≥24h for scheduled promo): Includes days; no seconds. Example: 01 DAYS 05 HRS 30 MINS.

---

## 4. Countdown Display Resolution

`resolveCountdownDisplay` (`countdown-mode.ts`) decides `countdownDisplay.type`.

**Decision tree:**

```
showCountdown = false?           → hidden (right side not shown)
draw today?                      → draw_tonight (countdown to freeze)
draw tomorrow?                   → draw_tomorrow (DRAWN TOMORROW + time)
scheduled promo active?          → midnight (24hr countdown to next midnight AEST, default)
else                             → midnight or static_urgency
```

**Step-by-step logic:**

1. **showCountdown = false** → `hidden` (right side not shown)
2. **Draw today** → `draw_tonight`
3. **Draw tomorrow** → `draw_tomorrow`
4. **Static urgency modes** (`limited_time_only`, `ending`, `static_urgency`):
   - Scheduled promo with time left → `midnight` (24hr countdown to next midnight AEST, default)
   - Else → `static_urgency` (label)
5. **scheduled_end mode** + scheduled promo → `scheduled_end` (countdown)
6. **Fallback** → `midnight` (countdown to next midnight AEST)

Default `countdownMode` is `limited_time_only`.

---

## 5. Countdown Sources

Three countdown timers are used:

| Timer | Used For | Target |
|-------|----------|--------|
| `freezeTimeLeft` | Draw tonight | `currentDraw.freezeEntriesAt` (when entries close) |
| `scheduledEndTimeLeft` | Scheduled promo ending | `effectiveEntry.scheduledEndDate` |
| `timeLeft` | Midnight fallback | Next midnight AEST, or freeze when within 48h |

---

## 6. Behaviour Summary by Scenario

| Scenario | Badge | Main Line | Right Side |
|----------|-------|-----------|------------|
| No promo | BONUS ENTRIES | JOIN NOW | NEXT DRAW |
| Draw today | DRAWN TONIGHT | GET X ENTRIES | Countdown to freeze |
| Draw today + scheduled promo &lt;24h | DRAWN TONIGHT | GET X ENTRIES | Countdown to freeze *(draw wins)* |
| Draw tomorrow | DRAWN TOMORROW | GET X ENTRIES | DRAWN TOMORROW + time |
| Scheduled promo (any time left) | BIG BONUS / ENDS TONIGHT (or variant badge) | GET X ENTRIES | 24hr countdown to midnight (HRS MINS SECS) |
| 10× multiplier (no draw/scheduled) | BIGGEST BONUS | GET 10X ENTRIES | Static label or countdown |
| Draw in 2+ days | Default badge (variant → 10× → scheduled text → alternating) | GET X ENTRIES | Static label or midnight countdown |

---

## 7. Variant Config & Split Testing

**Variant overrides apply only when the draw is not today or tomorrow.** They override scheduled-promo defaults (BIG BONUS, ENDS TONIGHT, PROMO ENDING) but never draw-based messaging.

- **`variantConfig.banner.badgeText`** — Overrides badge (BIG BONUS / ENDS TONIGHT) when scheduled promo is active and draw is not today/tomorrow
- **`variantConfig.banner.countdownLabel`** — Overrides static label when `static_urgency` is shown (no scheduled promo with end date)

When a variant does not set these values, the scheduled promo defaults apply.

---

## 8. Configuration

- **Constants** (`constants/promo-banner.ts`): `NO_PROMO_BADGE`, `NO_PROMO_MAIN_LINE`, `NO_PROMO_RIGHT_LABEL`
- **Variant config**: `variantConfig.banner.countdownMode`, `countdownLabel`, `badgeText`, `showCountdown`
- **Effective promo**: From `useEffectiveForBanner` — `source` (scheduled/toggle/alternating/none), `scheduledEndDate`, `durationMs`
- **Draw status**: From `currentDraw.drawDate` (AEST date comparison)

---

## 9. What We Do *Not* Show

- **48-hour countdown when draw is tomorrow** — We show static text (DRAWN TOMORROW + time), not a countdown.
- **Countdown to draw when 2+ days away** — We show static labels or midnight countdown instead of a draw countdown.

---

## 10. Related Files

- `src/components/sections/promo/PromoBanner.tsx` — Main component
- `src/utils/promo-banner/countdown-mode.ts` — Countdown display resolution
- `src/utils/promo-banner/resolve-badge-text.ts` — Badge text fallbacks
- `src/utils/promo-banner/default-text-manager.ts` — Alternating default text
- `src/constants/promo-banner.ts` — No-promo copy
