# Entry Colors, Explainer Modal, and MajorDrawSection Alignment

## Part A: My-Account Membership Entry Colors

**Goal:** Visually distinguish membership entry states so users instantly understand: failed renewal, upcoming entries, live entries.

**Scope:** [src/app/(site)/my-account/page.tsx](src/app/(site)/my-account/page.tsx) — Membership stat block only.

### States and Colors

| State | Condition | Entry Count Color | Label Text | Optional |
|-------|-----------|-------------------|------------|----------|
| Live | default | white | none | none |
| Upcoming | `pendingEntriesData && !isFailedRenewal` | muted (slate / blue-200) | "Added on renewal · {date}" or "Added on renewal" | subtle card tint |
| Failed renewal | `pendingEntriesData && isFailedRenewal` | accent (amber / red) | "Update payment to add entries" | subtle warning tint |

### Rules

- Never show 0 for upcoming or failed-renewal users.
- Count and label share the same color.
- Do not affect Total Entries or other stat cards.
- No new components; logic stays in page.

---

## Part B: SubscriptionExplainerModal Enhancements

### B.1 Copy fix (entry math clarity)

**Current:** "You receive X entries every month…"

**New:** "You receive **{entriesPerMonth} + {lastMonthAccumulatedEntries}** entries every month with your **{packageName}** membership."

### Data contract additions

Modal props now include:

- `lastMonthAccumulatedEntries: number`
- `selectedPackageId: string`

Trigger payload:

```ts
requestModal("subscription-explainer", false, {
  entriesPerMonth,
  lastMonthAccumulatedEntries,
  selectedPackageId,
  packageName,
  userId,
});
```

### B.2 Entry accumulation chart

- **Component:** Reuse [VerticalAccumulationChart](src/components/ui/VerticalAccumulationChart.tsx) from PackageSelectionModal.
- **Placement:** Between "You receive X + Y entries…" and "If you joined on the 25th–27th…".
- **Rendering:** `<VerticalAccumulationChart selectedPackageId={selectedPackageId} />`.
- **Behavior:** Static, no navigation or package switching; purely informational.

**Chart display rule:** Hide other packages. **Only show the package the user is subscribed to** (i.e. the one matching `selectedPackageId`). No Tradie/Foreman/Boss comparison — single-package view only. This may require a new prop (e.g. `showOnlySelected?: boolean`) or a dedicated "single-package" mode in VerticalAccumulationChart, or a wrapper that filters to one package before rendering.

---

## Part C: MajorDrawSection → PrizeShowcase Visual Alignment

**Goal:** Make MajorDrawSection visually consistent with PrizeShowcase without changing business logic.

**Scope:** [src/components/sections/MajorDrawSection.tsx](src/components/sections/MajorDrawSection.tsx).

### Image gallery

Match PrizeShowcase:

- `aspect-square lg:aspect-[4/3]`
- `getBrandBorderColor`, `getBrandGlowColor` for border and glow
- VIEW SPECS overlay
- Thumbnail styling identical

### Pick Your Toolset section

Match PrizeShowcase:

- Same heading: "Pick Your Toolset"
- Same toolbox toggle UI (Sidchrome / Milwaukee / $10k Cash)
- Same prize card layout

**Constraints:**

- Static only (no navigation, no slug changes).
- Toggle does **not** change route or prize content.
- Visual parity only.

### Right column (unchanged)

- Enter now
- View details
- User entries
- Countdown / draw-ended state

---

## Part D: Files to Touch

| File | Changes |
|------|---------|
| [src/app/(site)/my-account/page.tsx](src/app/(site)/my-account/page.tsx) | Entry color states; explainer trigger payload adds `lastMonthAccumulatedEntries`, `selectedPackageId` |
| [src/components/modals/SubscriptionExplainerModal.tsx](src/components/modals/SubscriptionExplainerModal.tsx) | New copy; insert VerticalAccumulationChart; accept new props |
| [src/components/modals/UnifiedModalManager.tsx](src/components/modals/UnifiedModalManager.tsx) | Pass new props from `activeModalData` |
| [src/components/sections/MajorDrawSection.tsx](src/components/sections/MajorDrawSection.tsx) | Align gallery + Pick Your Toolset with PrizeShowcase |
| [src/components/ui/VerticalAccumulationChart.tsx](src/components/ui/VerticalAccumulationChart.tsx) | Optional: support "show only selected package" (hide other packages) when used in explainer |

---

## Part E: Guardrails (What We Do NOT Change)

- No new hooks
- No DB persistence
- No stat card refactors
- No routing changes
- No Total Entries logic changes
- No PackageSelectionModal logic changes

---

## Part F: Implementation Order

1. **Explainer modal:** Add props; fix copy; insert chart; wire through UnifiedModalManager + trigger. Ensure VerticalAccumulationChart shows only the user’s subscribed package.
2. **My-account colors:** Apply state-based color rules for live / upcoming / failed renewal.
3. **MajorDrawSection:** Align image gallery; align Pick Your Toolset UI; keep right column intact.
