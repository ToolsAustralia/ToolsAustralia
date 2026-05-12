# Admin Draw Entry Picker — Design

**Date:** 2026-05-12
**Area:** `src/components/admin/UserDetailModal.tsx` (Activity / "Manage Draw Entries" section)
**Domain:** `admin`

## Problem

In the admin User Detail modal, the "Manage Draw Entries" form (Activity tab → edit mode) currently requires the admin to **manually type an ObjectId** to assign a user to a major draw or mini draw:

- `<Input label="Draw ID" placeholder="Major draw ObjectId">` ([UserDetailModal.tsx:3154](src/components/admin/UserDetailModal.tsx#L3154))
- `<Input label="Mini Draw ID" placeholder="Mini draw ObjectId">` ([UserDetailModal.tsx:3226](src/components/admin/UserDetailModal.tsx#L3226))

Each entry card is also headed by a generic `Major Draw 1`, `Major Draw 2`, etc. ([UserDetailModal.tsx:3140](src/components/admin/UserDetailModal.tsx#L3140), [UserDetailModal.tsx:3212](src/components/admin/UserDetailModal.tsx#L3212)) with no indication of *which* draw the row points at.

This is error-prone (typos = wrong user gets entries) and slow.

## Goal

Replace the ObjectId text inputs with a **searchable dropdown** that lists existing draws by **name + one image**, so the admin can pick a draw visually without leaving the modal. Card headers should display the selected draw's name instead of the row index.

## Non-goals

- No backend / Mongoose schema changes. Payload still carries `drawId` / `miniDrawId` (the ObjectId string the dropdown produces).
- No bulk operations.
- No editing draw metadata from this form (admin already has separate screens for that).
- No paged/infinite list inside the dropdown — a single fetch of up to 100 records each is enough (see Open Questions).

## Scope of draws shown

Per user decision: **all statuses** for both major and mini draws (queued, active, frozen, completed, cancelled). Lets admin correct historical records, not just current ones.

## Architecture

### Data hooks (new)

Two small TanStack Query hooks under `src/hooks/queries/admin/`:

```ts
// useAdminMajorDrawsList.ts
export const useAdminMajorDrawsList = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "major-draw", "list"],
    queryFn: () => apiGet(`/api/admin/major-draw/history?limit=100&sortBy=drawDate&sortOrder=desc`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
```

```ts
// useAdminMiniDrawsList.ts
export const useAdminMiniDrawsList = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "mini-draw", "list"],
    queryFn: () => apiGet(`/api/admin/mini-draw/list?limit=100&sortBy=createdAt&sortOrder=desc`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
```

Both endpoints already exist ([`/api/admin/major-draw/history`](src/app/api/admin/major-draw/history/route.ts), [`/api/admin/mini-draw/list`](src/app/api/admin/mini-draw/list/route.ts)) and already return `_id`, `name`, `status`, and `prize.images[]` — no backend work.

`enabled` is bound to whether the activity edit form is open, so we don't fetch until the admin opens it.

### New component: `DrawSelect`

One new file: `src/components/admin/DrawSelect.tsx` (~150 LOC).

**Props**

```ts
interface DrawSelectOption {
  id: string;            // ObjectId string
  name: string;
  imageUrl?: string;     // prize.images[0] if present
  status: string;        // "active" | "queued" | ...
}

interface DrawSelectProps {
  options: DrawSelectOption[];
  value: string;                       // currently selected ObjectId
  onChange: (id: string) => void;
  disabledIds?: string[];              // already used in other rows
  loading?: boolean;
  placeholder: string;                 // e.g. "Select major draw…"
  label: string;                       // e.g. "Draw"
  error?: string;
}
```

**Behavior**

- Trigger button: `[32px image | name | chevron]`, or `[Trophy icon | placeholder]` when nothing selected.
- Click trigger → opens an absolutely-positioned panel below (max-height 18rem, scrollable).
- Panel top: a small `<input>` for filtering by name (client-side `name.toLowerCase().includes(q)`).
- Each row: `[32px image | name + status badge]`. Disabled rows (already used in a sibling form row) are dimmed and unclickable.
- No image → Lucide `Trophy` icon in a `bg-slate-100` rounded square (the agreed fallback).
- Closes on outside click / Escape.
- Keyboard: Up/Down to move highlight, Enter to select, Esc to close. (Light implementation — not a full ARIA combobox, but accessible enough for admin tooling.)

This component lives under `src/components/admin/` so it's already inside the `admin` manifest domain.

### Form integration in `UserDetailModal.tsx`

Inside the activity-edit branch (`isEditing("activity")`):

1. **Fetch lists once when entering edit mode**
   - `const majorDrawsQ = useAdminMajorDrawsList(isEditing("activity"));`
   - `const miniDrawsQ = useAdminMiniDrawsList(isEditing("activity"));`
   - Build `majorDrawOptions` / `miniDrawOptions` via `useMemo`, mapping API response → `DrawSelectOption`.

2. **Major draw row** — replace the `<Input label="Draw ID">` Controller block ([UserDetailModal.tsx:3149-3162](src/components/admin/UserDetailModal.tsx#L3149-L3162)) with:
   ```tsx
   <DrawSelect
     options={majorDrawOptions}
     value={field.value ?? ""}
     onChange={field.onChange}
     disabledIds={otherSelectedMajorDrawIds(index)}
     loading={majorDrawsQ.isLoading}
     placeholder="Select major draw…"
     label="Draw"
     error={fieldState.error?.message}
   />
   ```

3. **Mini draw row** — same swap at [UserDetailModal.tsx:3221-3234](src/components/admin/UserDetailModal.tsx#L3221-L3234), using `miniDrawOptions` and disabled-ids derived from sibling rows.

4. **Card headers** — change:
   - `<h5>Major Draw {index + 1}</h5>` → look up the selected option's name; if blank, fall back to `Major Draw {index + 1}` so newly-added empty rows still render a header.
   - Same treatment for the mini-draw header.

5. **Duplicate guard** — `disabledIds` is computed from `activityForm.watch("majorDrawParticipation")` / `…miniDrawParticipation`, excluding the current row's own selection.

### Backend

Nothing changes. The mutation [`syncMajorDrawParticipation`](src/features/admin/users/server/mutations.ts) and [`syncMiniDrawParticipation`](src/features/admin/users/server/mutations.ts) still receive `{ drawId, totalEntries, … }` / `{ miniDrawId, totalEntries, isActive, … }` exactly as today.

### Manifest / docs impact

- `DrawSelect.tsx` → `src/components/admin/` → already covered by the `admin` domain (`docs/admin/`).
- Hooks → `src/hooks/queries/admin/**` → already covered by the `admin` domain.
- No manifest entry needs editing.
- `docs/admin/` will need a short note added to its `gotchas.md` or `architecture.md` describing the new picker.

## UX details

**Trigger (closed)**

```
┌──────────────────────────────────────────────────┐
│ [img] May 2026 Mazda CX-5 Draw      [Active]  ▾ │
└──────────────────────────────────────────────────┘
```

**Trigger (empty)**

```
┌──────────────────────────────────────────────────┐
│ 🏆  Select major draw…                        ▾ │
└──────────────────────────────────────────────────┘
```

**Open panel**

```
┌──────────────────────────────────────────────────┐
│ 🔍  Search by name…                              │
├──────────────────────────────────────────────────┤
│ [img] May 2026 Mazda CX-5 Draw    [Active]       │
│ [img] April 2026 Toyota RAV4      [Completed]    │
│ [img] March 2026 Hilux Draw       [Completed]    │
│ [🏆 ] Feb 2026 Cash Splash         [Completed]   │  ← no image
│ …                                                │
└──────────────────────────────────────────────────┘
```

## Edge cases

- **Empty list / fetch error** — render `<DrawSelect loading=true>` skeleton row while loading, then a small inline error string + retry button if the query fails.
- **Selected draw no longer in fetched list** (e.g., we capped at 100 and the user's draw is older) — render the trigger with the stored `drawId` truncated (e.g. `…a3f2`) and a warning border so the admin notices; the card header falls back to `Major Draw {index + 1}` as today. Acceptable for now since 100 records covers all live data and well into history. *Listed in Open Questions in case it bites later.*
- **No image on selected draw** — Trophy fallback (same as in-list rows).
- **Admin adds two empty rows then picks the same draw in both** — second dropdown disables that draw; if they bypass by reordering, the existing backend `syncMajorDrawParticipation` already dedupes by drawId on save.

## Open questions (resolved before implementation if needed)

1. **List size** — both endpoints default `limit=20` with a max of 100. Is 100 enough for the historical draw set in production? If not, we either raise the cap or add server-side search-as-you-type. Defer until proven necessary.
2. **Status filter inside the dropdown** — not adding now (admin asked only for image + name). Easy to bolt on later (the option object already carries `status`).

## Out of scope

- Refactoring the read-only "Draw Participation" section ([UserDetailModal.tsx:3294-3417](src/components/admin/UserDetailModal.tsx#L3294-L3417)) — it already shows names + dates via the server-side join.
- Major-draw `prize.images` is deprecated for new draws; we are intentionally **not** wiring this picker to the static frontend prize configs. Whatever `prize.images[0]` is on the document is used, else Trophy fallback. Future work if needed.
