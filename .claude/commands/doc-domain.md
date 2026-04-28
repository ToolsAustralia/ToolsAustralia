---
description: Refresh documentation for a single domain (or scaffold a new one). Usage:/doc-domain <name>. If the domain exists in the Domain Manifest, re-reads its source files and surgically updates each doc. If not, scaffolds the standard 8 doc files and prompts the user to add a manifest entry.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <domain-name>
---

# /doc-domain — Refresh or add a single domain's documentation

You are refreshing (or creating) docs for one domain only.

## Argument

The user invoked you with `$ARGUMENTS` — that is the domain name (e.g., `subscription`, `billing-stripe`).

If `$ARGUMENTS` is empty, ask: "Which domain? (e.g., subscription, billing-stripe, draws, ...). Or run `/doc-sync` first to see the full list."

## Step 1: Read the manifest

Read `CLAUDE.md`. Extract the `Domain Manifest` JSON block. Look up `domains[<name>]`.

### If domain exists → REFRESH MODE

1. Read every source file matching the domain's `paths` globs.
2. Read every existing file in the domain's `docs` folder.
3. For each existing doc, **diff against current code reality**:
   - What's new in the code that the doc doesn't mention?
   - What does the doc claim that no longer exists in code?
   - What's been renamed/moved?
4. Surgically Edit each doc — change only what's stale. Do not blindly overwrite the whole file.
5. Update `lastVerified` to today's ISO date in the manifest.
6. Stop and ask the user: "Refreshed `docs/<name>/`. Diff summary: [N files changed, K lines added/removed]. Commit?"
7. Wait for explicit approval before `git commit -m "docs(<name>): refresh"`.

### If domain does NOT exist → SCAFFOLD MODE

1. Confirm with the user: "`<name>` is not in the Domain Manifest. Scaffold it as a new domain?"
2. Ask: "What source paths should this domain own? (Glob list — I'll add them to the manifest.)"
3. After user provides paths, generate the 8 base docs (plus models.md/testing.md as applicable) using the same template described in `/doc-bootstrap`.
4. Edit `CLAUDE.md` to add the new entry to the Domain Manifest JSON block:
   ```
   "<name>": {
     "docs": "docs/<name>/",
     "paths": [ ...user-supplied... ],
     "lastVerified": "<today>"
   }
   ```
5. Stop and ask the user: "New domain `<name>` scaffolded with N docs and added to manifest. Commit?"
6. Wait for explicit approval.

## Hard rules

- No autonomous commits. Always ask.
- No invented content. Use `_TODO: verify._` for unknowns.
- Surgical edits in refresh mode; full scaffold in scaffold mode. Never both.
- Cite code locations with `[file.ts:N](src/path/file.ts#LN)` links.

## Edge cases

- **Multiple domain match for one source file** — flag as a violation: "File X matches both `<a>` and `<b>` in the manifest — please disambiguate."
- **Domain has no matching source files** — ask the user: "`<name>` is in the manifest but no files match its paths. Was the domain renamed or deleted?"
- **Empty `lastVerified` (null)** — treat as "never verified" and do a full read pass, not just a diff.
