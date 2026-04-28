---
description: Manual audit — walks src/ and scripts/ to verify every file matches exactly one domain in the Domain Manifest. Reports orphans (files no domain covers) and ghosts (manifest paths pointing to deleted files). Optional companion to the automatic Stop hook.
allowed-tools: Read, Glob, Bash
---

# /doc-sync — Manual codebase coverage audit

You are running a one-shot audit. No file edits, no commits — just a report.

## What you are checking

The Domain Manifest in `CLAUDE.md` claims to map every source file to exactly one domain. This audit verifies that claim against reality.

## Step 1: Read the manifest

Extract the JSON block from `CLAUDE.md` between `<!-- DOMAIN-MANIFEST-START -->` and `<!-- DOMAIN-MANIFEST-END -->`. Parse it.

## Step 2: List all source files

Run:
```bash
find src scripts -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.js" \) 2>/dev/null
```

(Or use the Glob tool with patterns `src/**/*.{ts,tsx,mjs,js}` and `scripts/**/*.{ts,mjs,js}`.)

## Step 3: For each file, find its owning domain

Use the matching logic in `.claude/hooks/lib/match.mjs` (path globs: `**` = any depth, `*` = single segment, `{a,b}` = alternatives).

Categorize:
- **Owned (1 domain match)** — happy path, no report needed.
- **Orphan (0 domain matches)** — file exists but no manifest entry covers it.
- **Conflict (2+ domain matches)** — manifest violation; should never happen.

## Step 4: Check for ghost manifest entries

For each `paths` glob in the manifest, glob the filesystem. If the glob matches zero files, the entry is a "ghost" (likely points to deleted/renamed code).

## Step 5: Report

Output a concise report. No editing.

Format:
```
# Doc-Sync Audit Report — <today>

## Coverage
- Total source files: 1234
- Owned by a domain: 1230 (99.7%)
- Orphans: 4
- Conflicts: 0

## Orphans
- src/path/foo.ts
- src/path/bar.ts
...

For each orphan, suggest a domain to assign it to (based on file path/name heuristics).

## Conflicts
(none)

## Ghost manifest entries
- `subscription` → `src/services/subscription/old-thing.ts` (no files match)
- `promo` → `src/utils/promo-banner/legacy.ts` (no files match)

## Recommendations
1. Assign orphans to domains by editing CLAUDE.md.
2. Remove ghost entries (or fix renames).
3. After fixes, run `/doc-sync` again to confirm clean.
```

## Hard rules

- **Read-only.** Do not edit any files. Do not commit. Just report.
- **No false alarms.** Files in `node_modules/`, `.next/`, `dist/`, `coverage/`, `.git/` are excluded automatically by `find`. Verify your glob excludes these.
- **Cite paths.** Every orphan and ghost should include the full path so the user can click through.
