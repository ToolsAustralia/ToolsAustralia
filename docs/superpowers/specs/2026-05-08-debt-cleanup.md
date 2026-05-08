# Debt Cleanup — Spec

**Date:** 2026-05-08
**Owner:** DJ (autonomous-author: Claude)
**Surface:** Codebase-wide — `src/components/**`, `src/app/**`, `src/utils/**`
**Status:** Spec → Plan 5

## Problem

Plans 1-4 left a backlog of mechanical debt the audits flagged but didn't address:

| Item | Count | Source |
|---|---|---|
| `!important` overrides in JSX | **86** | Plan 1 audit |
| Template-literal classNames (`` className={`base ${cond ? "a" : "b"}`} ``) | **704** | Plan 1 audit |
| `#dc2626` literal hex sites (Tailwind-default red, NOT brand red) | **48** | Plan 1 audit; deliberately excluded from sweep-brand-red codemod |
| `#ef4444` literal hex sites (Tailwind-default red-500, NOT brand red) | **12** | Same |
| Large admin files scoring 5+ decomposition signals | 3 (UserDetailModal, UsersManagement, Header) | Plan 1 audit |
| No screening tool to spot future decomposition candidates | n/a | Documented in `component-decomposition-criteria.md` as future work |

Each item alone is small; together they're a ~15-20h sweep that consolidates the codebase's quality posture.

## Goals

- Audit and either remove or document every `!important` override
- Sweep `className={\`...${cond ? "a" : "b"}...\`}` template-literal patterns into `cn()` calls (where mechanical)
- Per-file review the 48 `#dc2626` sites — convert to `red-600` token if intentional brand-red, leave/document if intentional Tailwind-default
- Build the `audit-decomposition` screening codemod (produces ranked backlog at `docs/shared-ui/decomposition-backlog.md`)
- Decompose the 3 worst-offending large files (UserDetailModal, UsersManagement, Header) per the Plan 2/3 pattern

## Non-goals

- Behavior changes — every change is structural/cosmetic
- Performance optimization
- Accessibility audit (separate effort)
- Storybook setup
- Migrating existing components to the Plan 4 primitives (opportunistic only — when a file is touched for other reasons here, it MAY adopt; not required)

## Phased plan

### Phase 1 — `!important` audit + removal
The `!important` audit produces a per-file inventory. Each occurrence falls into one of three buckets:
- **Removable** — it was added defensively against now-resolved CSS specificity, or `tailwind-merge`'s utility-conflict resolution makes it redundant. Remove.
- **Intentional cross-tree override** — needed because the override target's classes aren't easily controllable. Wrap with a comment explaining why; leave.
- **Bug** — the !important is masking a real layering issue. Fix the root cause; remove the !important.

Deliverable: 86 sites triaged + classified + cleaned where possible.

### Phase 2 — Template-literal → cn() sweep (codemod)
Most template-literal classNames have shape `` className={`{base classes} ${cond ? "a" : "b"} ${className}`} ``. Convert to `className={cn("{base classes}", cond ? "a" : "b", className)}`. Edge cases (multi-condition interpolation, runtime-computed strings) are left untouched.

Codemod: `scripts/codemods/sweep-classname-template-literals.ts`. Dry-run + apply pattern matches Plan 1's brand-red sweep.

### Phase 3 — `#dc2626` per-file visual review
48 sites. Each gets a quick "should this be brand red (#ee0000) or Tailwind default (#dc2626)?" call. Most will be brand-red drift bugs (developer typed `#dc2626` thinking it's "red"); some may be intentional UI distinguishing (admin chrome, errors, etc.). Convert in bulk (`sed -i 's/\[#dc2626\]/red-600/g'` style) only after spot-check confirms majority are drift bugs. Hand-edit the legitimate exceptions.

Same approach for the 12 `#ef4444` sites.

### Phase 4 — `audit-decomposition` codemod
Build `scripts/codemods/audit-component-decomposition.ts` that walks `src/components/` + `src/app/` and scores each `.tsx` file against the criteria in [component-decomposition-criteria.md](../../shared-ui/component-decomposition-criteria.md). Output: `docs/shared-ui/decomposition-backlog.md` — ranked list with per-file scores. Wired to `npm run audit:decomposition`.

The backlog becomes the work queue for future decomposition work (Plan 7+).

### Phase 5 — Large admin file decomposition
Apply the Plan 2/3 decomposition pattern to:
- `src/components/admin/UserDetailModal.tsx` — 52+ long-className attrs
- `src/components/admin/UsersManagement.tsx` — large list/table component
- `src/components/layout/Header.tsx` — 31+ long-className attrs

Each gets its own audit → folder + sub-components + smoke test cycle (similar to RenewalFailedModal in Plan 3 Phase 1). Larger effort.

## Risks

- **Phase 2 codemod false positives** — template literals are diverse; the codemod must be conservative. Default to leaving complex template literals alone; only touch the simple `{base} ${cond ? "a" : "b"}` shape.
- **Phase 3 visual drift** — converting `#dc2626` → `red-600` IS a small color shift (`#dc2626` is slightly lighter than `#ee0000`). Spot-check after.
- **Phase 5 scope creep** — admin files touch lots of state. Each decomposition is its own multi-task effort; if any single one balloons, defer to a separate plan.

## Sequencing

Phases 1-4 are mechanical and can run in parallel order. Phase 5 is the heaviest — should run last because it benefits from the cleaner foundation.

For execution: do Phases 1-4 in this Plan 5 commit cycle. Phase 5 is **scoped** in this plan but **deferred** to a follow-up Plan 7 ("Plan 5 Phase 5") given the complexity. This keeps Plan 5 to ~6-8 hours of mechanical work; the admin decompositions (~10-15h) get their own plan with audit + sub-task structure like Plan 3.
