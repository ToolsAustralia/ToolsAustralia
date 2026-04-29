# Error Reporting — Frontend

## Components

[src/components/error/](../../src/components/error/) — error boundaries, fallback UIs, recovery prompts.

> _TODO: enumerate exact components._

## Hooks

| Hook | Purpose |
|---|---|
| `useErrorHandling()` | Generic error capture for components |
| `useErrorRecovery()` | Recovery flows for known error states |

## Pattern

Wrap page-level components in error boundaries. The boundary captures, classifies, posts to `/api/error-reports`, and renders the fallback UI.

## Recovery vs report

Recovery = user can retry / continue (e.g. payment 3DS challenge expired). Report = log for triage. Many errors are both.
