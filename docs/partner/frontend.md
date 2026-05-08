# Partner — Frontend

## Pages

`src/app/(site)/partner/` — partner discount catalog page (members view available discounts).

## Components

> _TODO: enumerate components specific to partner._

## Data sources

- TanStack Query for partner catalog reads
- Discount visibility computed server-side via `partner-catalog-visibility.ts`

## className conventions (2026-05-08)

Partner components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.
