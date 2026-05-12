# Admin Draw Entry Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ObjectId text inputs in the admin "Manage Draw Entries" form with searchable image-and-name dropdowns for both major draws and mini draws, and label each entry row by the selected draw's name.

**Architecture:** Build one new `DrawSelect` popover component used twice (major + mini), backed by two new TanStack Query hooks that hit the existing `/api/admin/major-draw/history` and `/api/admin/mini-draw/list` endpoints. No backend, schema, or API changes.

**Tech Stack:** Next.js 15, React 19, TanStack Query, Tailwind, lucide-react icons, react-hook-form, `next/image`.

**Source spec:** [docs/superpowers/specs/2026-05-12-admin-draw-entry-picker-design.md](docs/superpowers/specs/2026-05-12-admin-draw-entry-picker-design.md)

**Testing note:** This repo has no UI test runner (per CLAUDE.md "Tests are standalone `tsx` scripts under `src/**/__tests__/`"). UI verification is `npm run type-check`, `npm run lint`, and a manual smoke in the admin user-detail modal. We intentionally do **not** invent a Jest/Vitest setup for this work.

**Commit policy:** Per CLAUDE.md hard rule 1, do **not** commit unless the user explicitly authorizes. At the end of each task, ask the user "Want me to commit this?" and wait.

---

## File Structure

| Path | Action | Purpose |
|------|--------|---------|
| `src/hooks/queries/admin/useAdminMajorDrawsList.ts` | **Create** | TanStack Query hook → `GET /api/admin/major-draw/history?limit=100&sortBy=drawDate&sortOrder=desc`. |
| `src/hooks/queries/admin/useAdminMiniDrawsList.ts` | **Create** | TanStack Query hook → `GET /api/admin/mini-draw/list?limit=100&sortBy=createdAt&sortOrder=desc`. |
| `src/components/admin/DrawSelect.tsx` | **Create** | Reusable searchable popover. Trigger shows image + name + chevron. Open shows search input + filtered scrollable row list. |
| `src/components/admin/UserDetailModal.tsx` | **Modify** | Replace text inputs at lines 3149–3162 + 3221–3234, update card headers at lines 3140 + 3212, compute duplicate-guard `disabledIds`. Fetch lists with the new hooks. |
| `docs/admin/architecture.md` | **Modify** | One-paragraph note about the picker under the User Detail Modal section. |
| `docs/admin/gotchas.md` | **Modify** | Add a row to the gotchas table about the 100-record cap and stale-id fallback. |

All file paths fall under the `admin` domain manifest entry — no manifest edits required.

---

## Task 1: Add `useAdminMajorDrawsList` query hook

**Files:**
- Create: `src/hooks/queries/admin/useAdminMajorDrawsList.ts`

- [ ] **Step 1: Create the hook file**

File: `src/hooks/queries/admin/useAdminMajorDrawsList.ts`

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";

export interface AdminMajorDrawListItem {
  _id: string;
  name: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  prize: {
    name?: string;
    images?: string[];
  } | null;
  drawDate?: string;
}

type HistoryResponse = {
  success: true;
  data: {
    draws: AdminMajorDrawListItem[];
    pagination: { totalCount: number };
  };
};

export function useAdminMajorDrawsList(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "major-draw", "list", "all"],
    queryFn: async () => {
      const res = await apiGet<HistoryResponse>(
        "/api/admin/major-draw/history?limit=100&sortBy=drawDate&sortOrder=desc"
      );
      return res.data.draws;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 2: Verify the file type-checks**

Run: `npm run type-check`
Expected: PASS (no errors in `src/hooks/queries/admin/useAdminMajorDrawsList.ts`).

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: PASS (no new warnings in this file).

- [ ] **Step 4: Stop and ask user**

Say: "Hook 1 of 2 added. Want me to continue with Task 2 (mini draw hook), or commit first?"

Do **not** commit until the user says so.

---

## Task 2: Add `useAdminMiniDrawsList` query hook

**Files:**
- Create: `src/hooks/queries/admin/useAdminMiniDrawsList.ts`

- [ ] **Step 1: Create the hook file**

File: `src/hooks/queries/admin/useAdminMiniDrawsList.ts`

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";

export interface AdminMiniDrawListItem {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  prize: {
    name?: string;
    images?: string[];
  };
  displayOrder?: number;
  cycle?: number;
}

type ListResponse = {
  success: true;
  data: {
    miniDraws: AdminMiniDrawListItem[];
    pagination: { total: number };
  };
};

export function useAdminMiniDrawsList(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "mini-draw", "list", "all"],
    queryFn: async () => {
      const res = await apiGet<ListResponse>(
        "/api/admin/mini-draw/list?limit=100&sortBy=createdAt&sortOrder=desc"
      );
      return res.data.miniDraws;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 3: Stop and ask user**

Say: "Both hooks added. Want me to continue with Task 3 (the `DrawSelect` component), or commit first?"

---

## Task 3: Build `DrawSelect` popover component

**Files:**
- Create: `src/components/admin/DrawSelect.tsx`

- [ ] **Step 1: Create the component file**

File: `src/components/admin/DrawSelect.tsx`

```tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Search, Trophy } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DrawSelectOption {
  id: string;
  name: string;
  imageUrl?: string;
  status: string;
}

interface DrawSelectProps {
  options: DrawSelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabledIds?: string[];
  loading?: boolean;
  placeholder: string;
  label: string;
  error?: string;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  queued: "bg-blue-100 text-blue-700",
  frozen: "bg-amber-100 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE_STYLES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", cls)}>
      {status}
    </span>
  );
}

function ImageOrTrophy({ src, alt }: { src?: string; alt: string }) {
  if (src) {
    return (
      <span className="relative inline-flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
        <Image src={src} alt={alt} fill sizes="32px" className="object-cover" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-500">
      <Trophy size={16} />
    </span>
  );
}

export function DrawSelect({
  options,
  value,
  onChange,
  disabledIds = [],
  loading = false,
  placeholder,
  label,
  error,
}: DrawSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const selected = useMemo(
    () => options.find((o) => o.id === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlight(0);
  }, [query, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  const pick = useCallback(
    (id: string) => {
      if (disabledSet.has(id) && id !== value) return;
      onChange(id);
      setIsOpen(false);
      setQuery("");
    },
    [disabledSet, onChange, value]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt.id);
    }
  };

  const stale = value && !selected;

  return (
    <div className="w-full" ref={wrapperRef} onKeyDown={onKeyDown}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={loading && options.length === 0}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-red-400 focus-within:border-red-500"
            : stale
            ? "border-amber-400"
            : "border-gray-300 focus-within:border-blue-500"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <>
              <ImageOrTrophy src={selected.imageUrl} alt={selected.name} />
              <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{selected.name}</span>
              <StatusBadge status={selected.status} />
            </>
          ) : stale ? (
            <>
              <ImageOrTrophy alt="Unknown draw" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-amber-700">
                Unknown draw …{value.slice(-4)}
              </span>
            </>
          ) : (
            <>
              <ImageOrTrophy alt="No selection" />
              <span className="min-w-0 flex-1 truncate text-gray-500">{loading ? "Loading…" : placeholder}</span>
            </>
          )}
        </span>
        <ChevronDown size={16} className="flex-shrink-0 text-gray-400" />
      </button>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {isOpen && (
        <div className="relative z-10">
          <div className="absolute left-0 right-0 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
              <Search size={14} className="text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-500">
                  {options.length === 0 ? "No draws found." : "No matches for your search."}
                </p>
              ) : (
                filtered.map((opt, i) => {
                  const isDisabled = disabledSet.has(opt.id) && opt.id !== value;
                  const isSelected = opt.id === value;
                  const isHighlighted = i === highlight;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => pick(opt.id)}
                      onMouseEnter={() => setHighlight(i)}
                      disabled={isDisabled}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                        isHighlighted && !isDisabled && "bg-blue-50",
                        isSelected && "bg-blue-100 font-medium",
                        isDisabled && "cursor-not-allowed opacity-40"
                      )}
                    >
                      <ImageOrTrophy src={opt.imageUrl} alt={opt.name} />
                      <span className="min-w-0 flex-1 truncate text-gray-900">{opt.name}</span>
                      <StatusBadge status={opt.status} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DrawSelect;
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS. If the linter flags unused `React` import, remove it (React 19 / Next 15 doesn't require it).

- [ ] **Step 4: Stop and ask user**

Say: "DrawSelect component is in place. Next step wires it into the modal. Want me to continue, or commit first?"

---

## Task 4: Wire `DrawSelect` into `UserDetailModal.tsx`

**Files:**
- Modify: `src/components/admin/UserDetailModal.tsx` (imports + activity edit form section near lines 3084–3272)

This task is the biggest change. Do it in four sub-edits to keep diffs reviewable.

- [ ] **Step 1: Add imports**

In [src/components/admin/UserDetailModal.tsx](src/components/admin/UserDetailModal.tsx) find the existing import group ending with the `Select` / `Checkbox` lines (~line 54–55). Add immediately below:

```ts
import DrawSelect, { type DrawSelectOption } from "@/components/admin/DrawSelect";
import { useAdminMajorDrawsList } from "@/hooks/queries/admin/useAdminMajorDrawsList";
import { useAdminMiniDrawsList } from "@/hooks/queries/admin/useAdminMiniDrawsList";
```

- [ ] **Step 2: Fetch and map options inside the component body**

Find the existing `handleAddMiniDraw` definition (~line 968). Immediately **after** the `handleAddMiniDraw` function ends, add:

```ts
  const activityEditing = activeEditTab === "activity";
  const majorDrawsQ = useAdminMajorDrawsList(activityEditing);
  const miniDrawsQ = useAdminMiniDrawsList(activityEditing);

  const majorDrawOptions = useMemo<DrawSelectOption[]>(
    () =>
      (majorDrawsQ.data ?? []).map((d) => ({
        id: d._id,
        name: d.name,
        imageUrl: d.prize?.images?.[0],
        status: d.status,
      })),
    [majorDrawsQ.data]
  );

  const miniDrawOptions = useMemo<DrawSelectOption[]>(
    () =>
      (miniDrawsQ.data ?? []).map((d) => ({
        id: d._id,
        name: d.name,
        imageUrl: d.prize?.images?.[0],
        status: d.status,
      })),
    [miniDrawsQ.data]
  );

  const watchedMajorDraws = activityForm.watch("majorDrawParticipation");
  const watchedMiniDraws = activityForm.watch("miniDrawParticipation");

  const getOtherSelectedMajorIds = (currentIndex: number): string[] =>
    (watchedMajorDraws ?? [])
      .map((row, i) => (i !== currentIndex ? row?.drawId : ""))
      .filter((id): id is string => !!id);

  const getOtherSelectedMiniIds = (currentIndex: number): string[] =>
    (watchedMiniDraws ?? [])
      .map((row, i) => (i !== currentIndex ? row?.miniDrawId : ""))
      .filter((id): id is string => !!id);
```

**Note:** if `useMemo` isn't already imported from `"react"` at the top of the file, it is — see line 3 (`import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";`).

- [ ] **Step 3: Replace the major draw row UI**

Locate the block at [src/components/admin/UserDetailModal.tsx](src/components/admin/UserDetailModal.tsx) starting around line 3133 (`majorDrawFields.map((field, index) => {`). Replace the entire returned `<div>` (from `<div key={field.id}` through its closing `</div>` near line 3182) with:

```tsx
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">
                                      {majorDrawOptions.find((o) => o.id === watchedMajorDraws?.[index]?.drawId)?.name ??
                                        `Major Draw ${index + 1}`}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMajorDraw(index)}
                                      className="text-xs font-medium text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`majorDrawParticipation.${index}.drawId` as const}
                                      render={({ field, fieldState }) => (
                                        <DrawSelect
                                          label="Draw"
                                          placeholder="Select major draw…"
                                          options={majorDrawOptions}
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          disabledIds={getOtherSelectedMajorIds(index)}
                                          loading={majorDrawsQ.isLoading}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`majorDrawParticipation.${index}.totalEntries` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Total Entries"
                                          type="number"
                                          value={field.value || 0}
                                          onChange={(e) => {
                                            const value = e.target.value === "" ? 0 : Number(e.target.value);
                                            field.onChange(isNaN(value) ? 0 : value);
                                          }}
                                          min={0}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                  </div>
                                </div>
                              );
```

- [ ] **Step 4: Replace the mini draw row UI**

Locate the corresponding block starting around line 3205 (`miniDrawFields.map((field, index) => {`). Replace the entire returned `<div>` (from `<div key={field.id}` through its closing `</div>` near line 3267) with:

```tsx
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">
                                      {miniDrawOptions.find((o) => o.id === watchedMiniDraws?.[index]?.miniDrawId)?.name ??
                                        `Mini Draw ${index + 1}`}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniDraw(index)}
                                      className="text-xs font-medium text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.miniDrawId` as const}
                                      render={({ field, fieldState }) => (
                                        <DrawSelect
                                          label="Mini draw"
                                          placeholder="Select mini draw…"
                                          options={miniDrawOptions}
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          disabledIds={getOtherSelectedMiniIds(index)}
                                          loading={miniDrawsQ.isLoading}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.totalEntries` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Total Entries"
                                          type="number"
                                          value={field.value || 0}
                                          onChange={(e) => {
                                            const value = e.target.value === "" ? 0 : Number(e.target.value);
                                            field.onChange(isNaN(value) ? 0 : value);
                                          }}
                                          min={0}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.isActive` as const}
                                      render={({ field }) => (
                                        <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
                                          <Checkbox
                                            checked={field.value ?? true}
                                            onChange={(e) => field.onChange(e.target.checked)}
                                            label="Entry active"
                                          />
                                        </div>
                                      )}
                                    />
                                  </div>
                                </div>
                              );
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS. If `useMemo` is reported unused elsewhere, leave it — it's used in the new code. If lint flags `disabledSet` or `pick` in `DrawSelect`, ignore — they're used.

- [ ] **Step 6: Manual smoke test**

1. Run: `npm run dev`
2. Sign in as an admin user.
3. Open the admin Users page, open any user's detail modal.
4. Switch to the **Activity** tab and click **Edit Entries**.
5. Verify:
   - The major-draw row now shows a `DrawSelect` trigger with placeholder "Select major draw…".
   - Clicking it opens a panel with a search input and rows showing image (or Trophy fallback) + name + status badge.
   - Typing in the search filters the list.
   - Selecting a draw updates both the trigger AND the card header (e.g. it now reads "May 2026 Mazda CX-5 Draw" instead of "Major Draw 1").
   - Adding a second major-draw row and opening its dropdown disables the already-selected draw.
   - Same checks for the mini-draw section.
   - Saving the form persists (open the modal again — selections are still there in the dropdowns).
6. Open DevTools Network tab and confirm only **one** request each to `/api/admin/major-draw/history?limit=100…` and `/api/admin/mini-draw/list?limit=100…` per session (or per page reload while the form is open).

If anything fails, stop and report findings — do not paper over with extra state.

- [ ] **Step 7: Stop and ask user**

Say: "Picker is wired up and verified locally. Two doc updates left (Task 5 and 6). Want me to continue, or commit first?"

---

## Task 5: Update `docs/admin/architecture.md`

**Files:**
- Modify: `docs/admin/architecture.md`

- [ ] **Step 1: Open the file and find the User Detail Modal section**

Run: `npm run lint` is not needed for this task. Just open the file.

Find the section that documents the User Detail Modal (search for `UserDetailModal` or "Activity" tab — the section heading varies; the manifest places this file as the home for admin architecture docs).

- [ ] **Step 2: Add a subsection describing the picker**

Add the following paragraph under the User Detail Modal section (or under "Activity tab" if such a heading exists; create one if not):

```markdown
### Draw entry picker (Activity tab → Edit Entries)

The "Manage Draw Entries" form (admin edit mode in the Activity tab) uses
`src/components/admin/DrawSelect.tsx` to pick draws by name and image
instead of pasting ObjectIds. Two hooks back it:

- `useAdminMajorDrawsList` → `GET /api/admin/major-draw/history?limit=100`
- `useAdminMiniDrawsList`  → `GET /api/admin/mini-draw/list?limit=100`

Both are lazy (`enabled` bound to `activeEditTab === "activity"`) and cached
for 5 minutes. The payload sent to the existing
`/api/admin/users/[id]` route is unchanged — `drawId` / `miniDrawId` are
still ObjectId strings.
```

- [ ] **Step 3: Bump `lastVerified` in the Domain Manifest**

In [CLAUDE.md](CLAUDE.md), find the `"admin"` entry in the Domain Manifest JSON block and update `"lastVerified": "2026-05-10"` → `"lastVerified": "2026-05-12"`.

- [ ] **Step 4: Stop and ask user**

Say: "Architecture doc updated. One more doc (gotchas.md) left. Continue?"

---

## Task 6: Update `docs/admin/gotchas.md`

**Files:**
- Modify: `docs/admin/gotchas.md`

- [ ] **Step 1: Add a gotcha entry**

Open `docs/admin/gotchas.md` and append a new section (matching the existing file's heading style — check the file first; most repo gotchas files use `##` headings per item):

```markdown
## DrawSelect caps at 100 records

`useAdminMajorDrawsList` and `useAdminMiniDrawsList` request `limit=100`
from the admin history/list endpoints. If a user's draw participation
references an older draw that falls outside the most recent 100 records,
the `DrawSelect` trigger renders an amber warning with the last 4 chars
of the ObjectId ("Unknown draw …a3f2") rather than the draw name.

The card header falls back to `Major Draw {N}` / `Mini Draw {N}` in this
case. The form still saves correctly because the stored `drawId` is
untouched — only the visible label is degraded.

If this starts happening in normal admin flows (not just historical
archaeology), raise the cap or add server-side search to both endpoints.
```

- [ ] **Step 2: Stop and ask user**

Say: "All four files updated. Final task is the verification pass + handoff. Want me to commit now, or run verification first?"

---

## Task 7: Final verification pass

**Files:** none modified — verification only.

- [ ] **Step 1: Full type-check**

Run: `npm run type-check`
Expected: PASS with no errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS with no new warnings/errors attributable to this change.

- [ ] **Step 3: Run doc-sync check**

Run: `node .claude/hooks/doc-sync.mjs` (or trigger via the Stop hook — easiest is to invoke `/doc-sync`).
Expected: no orphan paths, no ghost paths, no stale-doc complaints for the `admin` domain.

If the hook complains about `docs/admin/`, re-read the changed paths and add any missing notes. Do not bypass.

- [ ] **Step 4: Final smoke test in browser**

Repeat the smoke checklist from Task 4 / Step 6. Specifically reconfirm:
- Search works in both pickers.
- Duplicate guard works in both sections.
- Card header reflects the chosen draw's name.
- Saving still results in correct entries on the user (open the modal again, dropdowns show the saved selections).

- [ ] **Step 5: Handoff**

Say to the user:

> "All tasks complete. Files changed:
> - `src/hooks/queries/admin/useAdminMajorDrawsList.ts` (new)
> - `src/hooks/queries/admin/useAdminMiniDrawsList.ts` (new)
> - `src/components/admin/DrawSelect.tsx` (new)
> - `src/components/admin/UserDetailModal.tsx` (modified)
> - `docs/admin/architecture.md` (modified)
> - `docs/admin/gotchas.md` (modified)
> - `CLAUDE.md` (manifest `lastVerified` bump)
>
> Want me to commit all of this as one commit, or split it (hooks + component, then modal wiring, then docs)?"

Wait for the explicit commit authorization (`commit`, `ship it`, etc.) before running any `git` command.

---

## Self-review checklist (run after writing this plan)

- [x] **Spec coverage:** Picker UI, search, image+name, duplicate guard, status fallback, no backend changes, name in card header, doc updates — all mapped to tasks 1–6.
- [x] **No placeholders:** All code blocks contain literal code; no "TODO", "implement later", or shape-only stubs.
- [x] **Type consistency:** `DrawSelectOption` interface is defined in Task 3, imported as a named type in Task 4 (`type DrawSelectOption`). `AdminMajorDrawListItem.prize.images` is `string[] | undefined`, mapped via `d.prize?.images?.[0]` in Task 4 Step 2.
- [x] **TDD note:** explicitly waived for UI work — repo has no UI test runner; verification is type-check + lint + manual smoke (matches existing admin component patterns).
- [x] **Commit policy:** every task ends with "ask the user before committing" per CLAUDE.md hard rule 1.
