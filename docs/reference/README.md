# Reference — context for Claude sessions

Drop-zone for material that gives a Claude session **background knowledge it can't derive
from the code**: brand voice + tone, copy rules, external links, competitor/partner pages,
screenshots, exported style guides.

This is **not** domain documentation. `docs/<domain>/` describes how *this codebase* works
and is governed by the Domain Manifest + doc-sync hook. Files here describe the *business
and brand context around* the codebase, so no manifest entry is needed.

## What goes here

| File | Holds |
|---|---|
| `voice-and-tone.md` | How Tools Australia sounds — vocabulary, register, do/don't phrasing |
| `links.md` | External URLs worth fetching: brand sites, partner portals, docs, inspiration |
| *(add as needed)* | One file per coherent topic; keep names lower-kebab-case |

## Rules for anything added here

- **Legal copy rules still win.** `CLAUDE.md` §11 (free-entry framing, never gambling)
  overrides any tone guidance in this folder. If a reference doc and §11 disagree, §11 wins
  and the reference doc should be corrected.
- **No secrets.** No API keys, no customer PII, no credentials — this folder is committed.
- **Date external claims.** A link or a screenshot captured on a date can go stale; say when
  it was captured so a later session knows to re-verify rather than trust it.
- **Say what's authoritative.** Mark each doc as either *authoritative* (we wrote it, follow
  it) or *reference only* (someone else's material, for inspiration/context).
