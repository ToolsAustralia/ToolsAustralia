# Contact — Patterns

## P1. Public POST + admin review

Public endpoint accepts; admin endpoint reads. No auto-replies, no third-party integrations — keeps the contact path simple.

## P2. Zod at boundary

Per CLAUDE.md route conventions, validate at the API boundary with Zod helpers from `src/lib/zod/`.
