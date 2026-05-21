# Speed Insights Best-Practice — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the substring `.includes("/admin")` admin filter inside `<SpeedInsights beforeSend>` with a parsed-URL `pathname.startsWith("/admin")` check, eliminating false-positive risk on query strings, hash fragments, and future public paths that contain the literal string `/admin`.

**Architecture:** Single-file React prop change in [`src/app/layout.tsx`](../../../src/app/layout.tsx) (root layout), plus a matching docs update in the `tracking` domain. No new files, no new dependencies, no API surface change. The change is one expression body inside an inline arrow function; nothing else in the file or codebase reads from or writes to `beforeSend`.

**Tech Stack:** `@vercel/speed-insights@^1.2.0` (next subpath), Next.js 15 App Router, React 19, TypeScript. Verification via `npm run type-check`, `npm run lint`, manual browser inspection.

**Spec:** [`docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md`](2026-05-13-speed-insights-best-practice.md) — see Phase 1 section and standing rules R3, R4. Phase 2 (debug-prop toggle) was rejected after verifying SDK source; see spec's "Phase 2 ❌ REJECTED" section for rationale.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/app/layout.tsx` (lines 149-152) | Replace `beforeSend` body |
| Modify | `docs/tracking/architecture.md` (line ~79, "Observability sampling" section) | Update prose to describe pathname-based filter, reference R4 from the spec |
| Modify | `docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md` | Mark Phase 1 ✅ once landed; bump audit date if rerun |

No tests are added or modified. The repository has no Jest/Vitest runner ([`CLAUDE.md`](../../../CLAUDE.md) — "There is no test runner"); verification for this kind of frontend change is type-check + lint + manual browser inspection per CLAUDE.md's "For UI or frontend changes, start the dev server and use the feature in a browser" guidance.

---

## Task 1: Apply the pathname filter to `src/app/layout.tsx`

**Files:**
- Modify: `src/app/layout.tsx:149-152`

- [ ] **Step 1: Read the current state of layout.tsx around line 149 to confirm context**

The current lines 149-152 should read:

```tsx
<SpeedInsights
  sampleRate={0.1}
  beforeSend={(data) => (data.url.includes("/admin") ? null : data)}
/>
```

If they don't match, stop and reconcile before editing.

- [ ] **Step 2: Replace the `<SpeedInsights />` element with the pathname-filtered form**

Replace lines 149-152 with:

```tsx
<SpeedInsights
  sampleRate={0.1}
  beforeSend={(data) => {
    try {
      const pathname = new URL(data.url).pathname;
      return pathname.startsWith("/admin") ? null : data;
    } catch {
      return data;
    }
  }}
/>
```

Notes for the engineer applying this:
- `data.url` is typed `string` per [`node_modules/@vercel/speed-insights/dist/next/index.d.ts:13`](../../../node_modules/@vercel/speed-insights/dist/next/index.d.ts#L13). It is the full URL, not just the pathname.
- `new URL(...)` throws on malformed input. Wrapping in `try/catch` and returning `data` on parse failure is intentional: a parse-failure outcome should err toward forwarding the beacon (false negative on the filter) rather than swallowing data silently. This is consistent with R4 in the spec.
- The function body is the only line changed. Do not touch `sampleRate`, do not add a `debug` prop, do not reorder JSX siblings (`<Analytics />` must stay on line 148 above `<SpeedInsights />`).

- [ ] **Step 3: Run type-check, confirm pass**

Run: `npm run type-check`
Expected: exits 0, no output beyond the npm script banner.

If TypeScript errors appear, do not proceed. The most likely error is a typo in the destructuring or a stray brace. Re-read the diff against Step 2's code block.

- [ ] **Step 4: Run lint, confirm pass**

Run: `npm run lint`
Expected: exits 0. No warnings or errors emitted for `src/app/layout.tsx`.

If ESLint flags `no-empty` on the `catch {}` block, suppress the catch binding by writing `catch (_e) {}` and re-run. (At time of writing — 2026-05-13 — the project's ESLint config tolerates empty catches; this fallback is documented in case the rule tightens later.)

- [ ] **Step 5: Smoke-test in dev server**

Run: `npm run dev`
Expected: dev server boots, no compilation errors, no runtime warnings about SpeedInsights.

Open the site at the URL the dev server reports (typically `http://localhost:3000`). Open DevTools → Console. Confirm no red errors related to `SpeedInsights`, `vitals`, or `beforeSend`. (Speed Insights itself is silent in dev — that's expected. You're confirming nothing broke at module load.)

Visit `/admin` (login as an admin if required). Confirm the admin app renders normally; the filter logic runs but does not throw.

Stop the dev server (Ctrl+C) before continuing.

---

## Task 2: Update domain doc to describe the new filter

**Files:**
- Modify: `docs/tracking/architecture.md` (the "Observability sampling" section, currently around line 79)

- [ ] **Step 1: Read the current "Observability sampling" section**

Open [`docs/tracking/architecture.md`](../../tracking/architecture.md). Locate the section heading `## Observability sampling`. The current paragraph (one line ~79) describes the filter as dropping beacons whose URL `contains` `/admin`. This needs to be updated to describe the parsed-pathname form.

- [ ] **Step 2: Replace the Observability sampling paragraph**

Replace the existing paragraph that begins `Speed Insights mounted globally in ...` with:

```markdown
Speed Insights mounted globally in [`src/app/layout.tsx`](../../src/app/layout.tsx) with `sampleRate={0.1}` — beacons 10% of page views. Sufficient for stable Core Web Vitals trends; reduces Vercel Speed Insights data-point billing roughly 10×. A `beforeSend` filter parses each beacon URL and drops any whose pathname starts with `/admin`, so the admin app does not pollute real-user Core Web Vitals percentiles or consume data points (admin perf is not a user-facing concern, and admin traffic is unrepresentative of the public site). Substring matching is deliberately avoided per [Standing Rule R4](../superpowers/plans/2026-05-13-speed-insights-best-practice.md) — query strings, hash fragments, or future public paths containing the literal string `/admin` would otherwise produce false-positive drops. Vercel Web Analytics (`<Analytics />`) is currently unsampled — see [`docs/superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md`](../superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md) for follow-up.
```

Notes:
- The link `[Standing Rule R4]` points to the best-practice spec. Verify the relative path resolves: from `docs/tracking/architecture.md` to `docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md` is `../superpowers/plans/2026-05-13-speed-insights-best-practice.md`.
- Do not modify other paragraphs in the section (the Contentsquare paragraph immediately after must remain unchanged).

- [ ] **Step 3: Confirm the doc-sync invariant holds**

The doc-sync hook ([`.claude/hooks/doc-sync.mjs`](../../../.claude/hooks/doc-sync.mjs)) is a `Stop` hook — it runs automatically when the next agent turn ends, reads `.touched-files` populated by the PostToolUse hook, and blocks the turn with `BLOCKED: Stale docs` if any modified `src/` or `scripts/` file in a domain has no matching `docs/<domain>/` edit in the same working tree.

For this plan: the only `src/` edit is `src/app/layout.tsx`, which the Domain Manifest in [`CLAUDE.md`](../../../CLAUDE.md) maps to the `tracking` domain. We have a matching edit in `docs/tracking/architecture.md`. The invariant should be satisfied.

Manual check, since the engineer cannot trigger the hook directly:

Run: `git diff --name-only`
Expected output (order may vary):
```
docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md
docs/tracking/architecture.md
src/app/layout.tsx
```

If `git diff --name-only` shows additional `src/` or `scripts/` files, they would need their own domain doc updates. If it shows additional `docs/` files only, that is fine — the hook only blocks on missing doc updates, not on extra ones. If it shows files unrelated to this plan, investigate before continuing.

---

## Task 3: Mark Phase 1 complete in the spec

**Files:**
- Modify: `docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md`

- [ ] **Step 1: Update the "Audit summary" table row for the admin filter**

In the spec, find the table row:

```markdown
| Admin pages excluded | ⚠️ partial — see Phase 1 | layout.tsx:151 — uses substring `.includes("/admin")` |
```

Replace with:

```markdown
| Admin pages excluded | ✅ | layout.tsx:151 — parsed pathname + `startsWith("/admin")` (applied 2026-05-13) |
```

- [ ] **Step 2: Update the Phase 1 section header**

Find the header `### Phase 1 — Pathname-based admin filter (substantive)` and append `✅ APPLIED 2026-05-13`:

```markdown
### Phase 1 — Pathname-based admin filter (substantive) ✅ APPLIED 2026-05-13
```

Do not delete or rewrite the Phase 1 body — keep the rationale and code block as historical record.

---

## Task 4: Final verification + commit gate

- [ ] **Step 1: Re-run type-check and lint one final time**

Run: `npm run type-check && npm run lint`
Expected: both exit 0.

- [ ] **Step 2: Review the working-tree diff**

Run: `git status` then `git diff`
Expected files changed:
- `src/app/layout.tsx` — one logical change inside `<SpeedInsights />` only
- `docs/tracking/architecture.md` — one paragraph in "Observability sampling"
- `docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md` — two small annotations (audit table row + Phase 1 header)

No other files should appear in the diff. If they do, investigate before continuing — this plan is surgical, and an unexpected file is a red flag (a stray formatter run, a hook side-effect, an accidental save).

- [ ] **Step 3: Ask the user before committing**

Per [`CLAUDE.md`](../../../CLAUDE.md) Hard Rule #1 (no-auto-commit), commits require explicit user authorization using one of the keywords: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`.

If the user has not yet used one of those keywords in this session, ask:

> "Phase 1 applied. type-check + lint pass, diff is scoped to the three expected files. Want me to commit this?"

Do not invoke `git add` or `git commit` until the user confirms.

- [ ] **Step 4: When authorized, commit**

Stage and commit (do **not** use `git add -A`, stage specific files only per CLAUDE.md guidance):

```bash
git add src/app/layout.tsx docs/tracking/architecture.md docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md
git commit -m "$(cat <<'EOF'
chore(tracking): tighten Speed Insights admin filter to pathname.startsWith

The previous beforeSend used data.url.includes("/admin"), which would
false-positive on query strings (?next=/admin/...) and any future public
path containing the literal "/admin" substring. Parse the URL and test
the pathname prefix instead.

See docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md
for the standing rules (R3, R4) governing this filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, pre-commit / doc-sync Stop hook (if any) passes.

- [ ] **Step 5: Confirm the commit landed**

Run: `git log -1 --stat`
Expected: HEAD shows the three modified files, no others.

---

## Verification on production after merge

Speed Insights changes can't be verified on a dev server (the SDK is a no-op when `NODE_ENV === "development"` per the installed bundle at [`node_modules/@vercel/speed-insights/dist/index.mjs:17-29, 68`](../../../node_modules/@vercel/speed-insights/dist/index.mjs#L17-L29)). After merging to `main` and deploying:

1. On the production site, open DevTools → Network panel → filter by `vitals`.
2. Visit any public page (e.g., `/`). Reload several times if needed — sampling is 10%, so beacons fire on ~1 of 10 views. Confirm a `POST` to `/_vercel/speed-insights/vitals` appears.
3. Log in as admin, visit `/admin`. Reload several times. Confirm **no** `vitals` `POST` request appears in the Network panel.
4. Wait ~15 minutes, then check the Vercel Speed Insights dashboard. Confirm the admin pathnames stop appearing in the route breakdown (compared to a baseline date from before the deploy).

If step 3 shows admin beacons still firing, the filter has a bug — most likely the URL parse threw and the `catch` block let it through. Add a temporary `console.error` inside the catch block (preserved by [`removeConsole.exclude`](../../../next.config.ts#L66-L73)) to surface the offending URL, redeploy, and inspect.

---

## What this plan does NOT do (deliberate)

- **Does not add a Phase 2 debug toggle.** Verified against installed SDK source (2026-05-13) that the `debug` prop is a no-op on Vercel previews; further blocked by `compiler.removeConsole` and `silence-logs.ts`. See spec's "Phase 2 ❌ REJECTED" section.
- **Does not change `sampleRate`.** 10% is the documented cost-optimised value from the 2026-05-06 Tier 1 plan and produces stable percentiles at the current traffic volume.
- **Does not remove `force-dynamic`.** Owned by Tier 2 plan. This is the single biggest distortion of CWV numbers, but is out of scope for a Speed Insights config tightening.
- **Does not add tests.** Repo has no test runner; the change is a one-line filter in an inline JSX prop. Type-check + lint + browser verification is the right granularity.
- **Does not touch CSP, `silence-logs.ts`, `next.config.ts`, or anything else.** The spec's Standing Rules deliberately keep the surface area minimal.
