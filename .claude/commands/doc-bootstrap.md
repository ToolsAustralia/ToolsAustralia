---
description: One-time documentation bootstrap. Generates docs/<domain>/ folders for every domain in the Domain Manifest, migrating existing root /docs/*.md content into the new structure.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /doc-bootstrap — One-time codebase documentation pass

You are running a long, multi-commit documentation pass. Read this entire prompt before starting.

## What you are doing

Generate per-domain documentation folders under `docs/<domain>/` for every domain listed in the **Domain Manifest** (the JSON block in `CLAUDE.md` between `<!-- DOMAIN-MANIFEST-START -->` and `<!-- DOMAIN-MANIFEST-END -->`).

For each domain:
1. Read every source file matching the domain's `paths` globs.
2. Generate the standardized 8 base docs (always) plus 2 conditional docs (`models.md` if Mongo models present; `testing.md` if `__tests__` present).
3. Migrate any existing root-level `docs/*.md` or `src/docs/*.md` content that belongs to this domain into the new files.
4. Update `lastVerified` in the manifest to today's ISO date.
5. **Stop and ask the user to review and commit before moving to the next domain.**

## The 8 + 2 doc template

For every domain, generate these files inside `docs/<domain>/`:

| File | Always | Content |
|---|---|---|
| `README.md` | yes | Index — one-liner per other doc, ownership, related domains, links |
| `architecture.md` | yes | Data flow, layers, key entities, sequence diagrams (mermaid optional), how this domain fits the broader app |
| `frontend.md` | yes | Pages, components, hooks, client state. Stub with `_N/A — this domain has no frontend surface. See [architecture.md](./architecture.md)._` if domain has zero UI. |
| `backend.md` | yes | Services, repositories, jobs, webhooks, business rules. Stub if N/A. |
| `api.md` | yes | Every route under this domain — method, path, auth, request/response shape, error codes. Stub if N/A. |
| `rules.md` | yes | Hard must / must-not constraints (e.g., "all subscription dates use date-fns-tz Australia/Sydney"). Pull from CLAUDE.md, .cursor/rules/, code comments, and your own discoveries. |
| `patterns.md` | yes | Recurring code conventions in this domain (naming, error shapes, validation patterns). |
| `gotchas.md` | yes | Past incidents, surprising behaviors, race conditions, "looks-buggy-but-isn't". Mine git log, existing root docs, and code comments for these. |
| `models.md` | only if Mongo models present | One section per `models/*.ts` in this domain — schema fields, indexes, relationships, hooks |
| `testing.md` | only if tests present | Test setup, how to run, what's covered. The repo uses standalone tsx scripts, not jest — see CLAUDE.md for the npm script convention. |

### Stub format for N/A files

```markdown
# frontend.md

_N/A — this domain has no frontend surface. See [architecture.md](./architecture.md)._
```

## Migration of existing docs

Many domains overlap with existing markdown:

- **`docs/*.md`** at repo root (e.g., `BILLING_ANCHOR_24.md`, `EMAIL_MODULE.md`, `REFERRAL_SYSTEM.md`, `ERROR_REPORTING_SYSTEM.md`)
- **`src/docs/*.md`** (e.g., `KLAVIYO_INTEGRATION.md`, `PIXEL_INTEGRATION.md`)
- **Root-level `TESTING-TIMEZONE-DST.md`**

For each domain, before writing new docs:
1. Find existing docs that belong to this domain (check filename + content).
2. Distribute their content across the new files (architecture details → architecture.md, gotchas → gotchas.md, etc.).
3. Preserve all factual content. Do not summarize away specifics like ticket numbers, dates, env var names, or code paths.
4. **Do not delete the source file yet** — wait until the entire bootstrap is done (final task).

## Per-domain workflow

For each domain in the manifest, execute this loop:

1. **Read manifest entry** — paths, docs folder.
2. **Glob the source files** — every file matching the paths. Read them all.
3. **Find related existing docs** — search `docs/`, `src/docs/`, repo root for relevant `.md` files.
4. **Determine which docs to create** — always 8, plus models.md if `src/models/` paths in this domain, plus testing.md if `__tests__/` directories exist under any path.
5. **Generate each doc** — write factual, code-grounded content. Cite file paths for every claim. No invented "best practices" — only document what's actually there.
6. **Update the manifest** — set `lastVerified` for this domain to today's ISO date in the JSON block in CLAUDE.md.
7. **Stop and ask the user**: "Domain `<name>`: 8 (or 9/10) docs generated under `docs/<name>/`. Migrated content from: [list]. Please review. Want to commit this domain?"
8. **Wait for explicit user approval** before running `git commit`. Use commit message: `docs(<domain>): bootstrap domain documentation`.
9. After commit (or after user says skip), move to next domain.

## After all domains are done

10. Generate `docs/README.md` — a top-level index with a table linking to all 28 domain folders, brief one-liner per domain.
11. Delete the migrated original docs (`docs/*.md` files at root that were absorbed; `src/docs/*.md` files; root `TESTING-TIMEZONE-DST.md`). **Do NOT delete `docs/superpowers/` or any docs that did not get migrated.**
12. Stop and ask the user to review the deletion list before committing the final cleanup as `docs: complete bootstrap, remove migrated source files`.

## Hard rules (overriding any other behavior)

- **No autonomous commits.** Every commit requires explicit user approval. The repo has a no-auto-commit hook; do not try to bypass it.
- **No invented content.** If you don't know something, write `_TODO: verify with the team._` rather than guess. Better an honest gap than a wrong claim.
- **One domain at a time.** Do not parallelize across domains. The user needs to review each one before the next.
- **Cite code locations.** Use `[filename.ts:42](src/path/filename.ts#L42)` markdown links so the user can click through.
- **Mention `.cursor/agents/*.md`** in `patterns.md` where relevant. Each domain has a Cursor subagent that documents its boundary.

## How to start

1. Read CLAUDE.md fully (especially the Domain Manifest).
2. List the 28 domains and confirm with the user: "Bootstrap will generate ~250 doc files across 28 domains, ~28 commits. Start with `subscription` (alphabetical) or do you want to pick the order?"
3. Wait for user choice.
4. Execute the per-domain workflow.
